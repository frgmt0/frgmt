/* ============================================================
   Hardened, dependency-free auth for the frgmt CMS.

   - Passwords: PBKDF2-SHA256 (210k iters) + 16-byte random salt, WebCrypto.
   - Sessions: 32 random bytes in a __Host- cookie; only SHA-256(token) is
     stored, so a DB leak can't mint cookies. httpOnly, Secure, SameSite=Strict.
   - CSRF: per-session secret required (constant-time) on every mutating call.
   - Login throttling: per-IP attempt count in a sliding window.
   All comparisons that touch secrets are constant-time.
   ============================================================ */

import type { Env } from "./types";

const PBKDF2_ITERS = 210_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE = "__Host-session";

// Login throttle: at most MAX_ATTEMPTS failures per IP per WINDOW.
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const enc = new TextEncoder();

/* ---------- low-level crypto helpers ---------- */

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return hex(new Uint8Array(digest));
}

// Constant-time string compare (lengths leak only equal/!=, not content).
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Always compare a fixed-length view to avoid early-exit on length.
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* ---------- password hashing ---------- */

async function pbkdf2(password: string, salt: Uint8Array, iters: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
  return `pbkdf2$${PBKDF2_ITERS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = parseInt(parts[1], 10);
  if (!Number.isFinite(iters) || iters < 1) return false;
  const salt = unb64(parts[2]);
  const expected = parts[3];
  const got = b64(await pbkdf2(password, salt, iters));
  return timingSafeEqual(got, expected);
}

/* ---------- login throttling ---------- */

export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

export async function isThrottled(env: Env, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString().replace("T", " ").slice(0, 19);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at >= ?"
  )
    .bind(ip, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailedLogin(env: Env, ip: string): Promise<void> {
  // Best-effort cleanup of old rows, then record this attempt.
  const cutoff = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(cutoff),
    env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?, datetime('now'))").bind(ip),
  ]);
}

export async function clearLoginAttempts(env: Env, ip: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}

/* ---------- sessions ---------- */

export type Session = { userId: string; username: string; csrf: string };

export async function createSession(env: Env, userId: string): Promise<{ token: string; csrf: string }> {
  const token = b64(randomBytes(32)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]!));
  const csrf = b64(randomBytes(24)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]!));
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(tokenHash, userId, csrf, expires)
    .run();
  return { token, csrf };
}

export async function getSession(env: Env, req: Request): Promise<Session | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.user_id AS userId, s.csrf AS csrf, s.expires_at AS expires, u.username AS username
       FROM sessions s JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ userId: string; csrf: string; expires: string; username: string }>();
  if (!row) return null;
  if (new Date(row.expires.replace(" ", "T") + "Z").getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { userId: row.userId, username: row.username, csrf: row.csrf };
}

export async function destroySession(env: Env, req: Request): Promise<void> {
  const token = readCookie(req, COOKIE);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

/* ---------- cookies ---------- */

export function sessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  // __Host- prefix forces Secure + Path=/ + no Domain.
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/* ---------- CSRF ---------- */

// Returns true if the request carries a valid CSRF token for this session.
export function checkCsrf(req: Request, session: Session): boolean {
  const header = req.headers.get("X-CSRF-Token") || "";
  return header.length > 0 && timingSafeEqual(header, session.csrf);
}
