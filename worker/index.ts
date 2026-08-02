/// <reference types="@cloudflare/workers-types" />

/**
 * Blog API. Everything lives under /api/*; the static SPA handles the rest.
 *
 * Auth model, matching the kona-blog-db schema:
 *   admin_users.password_hash  "pbkdf2$<iters>$<saltB64>$<hashB64>" (SHA-256)
 *   sessions.token_hash        SHA-256 hex of the bearer token in the cookie
 *   sessions.csrf              per-session secret, echoed by /api/me and
 *                              required back as the x-csrf header on mutations
 *   login_attempts             one row per POST /api/login, per IP, so a
 *                              burst of failures locks the IP out for a while
 */

interface Env {
  DB: D1Database;
}

const SESSION_DAYS = 30;
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

const err = (status: number, message: string) => json({ error: message }, { status });

/* ---- crypto helpers ---- */

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = Number(parts[1]);
  if (!Number.isFinite(iters) || iters <= 0) return false;
  const salt = fromB64(parts[2]);
  const expected = fromB64(parts[3]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iters },
    key,
    expected.length * 8,
  );
  const got = new Uint8Array(bits);
  let diff = got.length ^ expected.length;
  for (let i = 0; i < Math.min(got.length, expected.length); i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

/* ---- sessions ---- */

function readToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "session") return v.join("=") || null;
  }
  return null;
}

interface Session {
  token_hash: string;
  user_id: string;
  csrf: string;
  username: string;
}

async function currentSession(env: Env, request: Request): Promise<Session | null> {
  const token = readToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.user_id, s.csrf, u.username
     FROM sessions s JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
  )
    .bind(tokenHash)
    .first<Session>();
  return row ?? null;
}

function sessionCookie(token: string, maxAge: number): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** Session + CSRF gate for mutations and admin reads. */
async function requireAdmin(env: Env, request: Request): Promise<Session | Response> {
  const session = await currentSession(env, request);
  if (!session) return err(401, "not signed in");
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("x-csrf") !== session.csrf) return err(403, "bad csrf token");
  }
  return session;
}

/* ---- posts ---- */

/** Lowercase id, same alphabet as the rows already in the table. */
const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => "abcdefghijklmnopqrstuvwxyz23456789"[b & 31])
    .join("");

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replaceAll("'", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "post";
}

async function uniqueSlug(env: Env, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  for (let i = 2; ; i++) {
    const row = await env.DB.prepare(
      `SELECT id FROM posts WHERE slug = ?${excludeId ? " AND id != ?" : ""}`,
    )
      .bind(...(excludeId ? [slug, excludeId] : [slug]))
      .first();
    if (!row) return slug;
    slug = `${base}-${i}`;
  }
}

interface PostBody {
  title?: unknown;
  slug?: unknown;
  content?: unknown;
  excerpt?: unknown;
  published?: unknown;
}

function readPostBody(body: PostBody) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!title || !content.trim()) return null;
  return {
    title,
    content,
    slug: typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : null,
    excerpt: typeof body.excerpt === "string" ? body.excerpt.trim() : "",
    published: body.published ? 1 : 0,
  };
}

/* ---- router ---- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      /* public */
      if (path === "/api/posts" && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT id, title, slug, excerpt, created_at FROM posts
           WHERE published = 1 ORDER BY created_at DESC`,
        ).all();
        return json({ posts: results });
      }

      const publicPost = path.match(/^\/api\/posts\/([a-z0-9-]+)$/);
      if (publicPost && method === "GET") {
        const post = await env.DB.prepare(
          `SELECT id, title, slug, excerpt, content, created_at, updated_at
           FROM posts WHERE slug = ? AND published = 1`,
        )
          .bind(publicPost[1])
          .first();
        return post ? json({ post }) : err(404, "post not found");
      }

      /* auth */
      if (path === "/api/login" && method === "POST") {
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const recent = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM login_attempts
           WHERE ip = ? AND at > datetime('now', ?)`,
        )
          .bind(ip, `-${WINDOW_MINUTES} minutes`)
          .first<{ n: number }>();
        if ((recent?.n ?? 0) >= MAX_ATTEMPTS) return err(429, "too many attempts, try again later");

        await env.DB.prepare(`INSERT INTO login_attempts (ip) VALUES (?)`).bind(ip).run();

        const body = (await request.json().catch(() => null)) as {
          username?: unknown;
          password?: unknown;
        } | null;
        const username = typeof body?.username === "string" ? body.username : "";
        const password = typeof body?.password === "string" ? body.password : "";

        const user = username
          ? await env.DB.prepare(`SELECT * FROM admin_users WHERE username = ?`)
              .bind(username)
              .first<{ id: string; password_hash: string }>()
          : null;
        const ok = user ? await verifyPassword(password, user.password_hash) : false;
        if (!ok || !user) return err(401, "wrong username or password");

        const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const csrf = b64url(crypto.getRandomValues(new Uint8Array(16)));
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO sessions (token_hash, user_id, csrf, expires_at)
             VALUES (?, ?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
          ).bind(await sha256Hex(token), user.id, csrf),
          env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`),
          env.DB.prepare(
            `DELETE FROM login_attempts WHERE at <= datetime('now', '-1 day')`,
          ),
        ]);

        return json(
          { username, csrf },
          { headers: { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) } },
        );
      }

      if (path === "/api/logout" && method === "POST") {
        const token = readToken(request);
        if (token) {
          await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`)
            .bind(await sha256Hex(token))
            .run();
        }
        return json({ ok: true }, { headers: { "set-cookie": sessionCookie("x", 0) } });
      }

      if (path === "/api/me" && method === "GET") {
        const session = await currentSession(env, request);
        if (!session) return err(401, "not signed in");
        return json({ username: session.username, csrf: session.csrf });
      }

      /* admin */
      if (path === "/api/admin/posts" && method === "GET") {
        const gate = await requireAdmin(env, request);
        if (gate instanceof Response) return gate;
        const { results } = await env.DB.prepare(
          `SELECT id, title, slug, excerpt, content, published, created_at, updated_at
           FROM posts ORDER BY created_at DESC`,
        ).all();
        return json({ posts: results });
      }

      if (path === "/api/admin/posts" && method === "POST") {
        const gate = await requireAdmin(env, request);
        if (gate instanceof Response) return gate;
        const fields = readPostBody(((await request.json().catch(() => ({}))) ?? {}) as PostBody);
        if (!fields) return err(400, "title and content are required");
        const id = newId();
        const slug = await uniqueSlug(env, fields.slug ?? slugify(fields.title));
        await env.DB.prepare(
          `INSERT INTO posts (id, title, slug, content, excerpt, published) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, fields.title, slug, fields.content, fields.excerpt, fields.published)
          .run();
        return json({ id, slug }, { status: 201 });
      }

      const adminPost = path.match(/^\/api\/admin\/posts\/([a-z0-9]+)$/);
      if (adminPost && method === "PUT") {
        const gate = await requireAdmin(env, request);
        if (gate instanceof Response) return gate;
        const id = adminPost[1];
        const fields = readPostBody(((await request.json().catch(() => ({}))) ?? {}) as PostBody);
        if (!fields) return err(400, "title and content are required");
        const slug = await uniqueSlug(env, fields.slug ?? slugify(fields.title), id);
        const res = await env.DB.prepare(
          `UPDATE posts SET title = ?, slug = ?, content = ?, excerpt = ?, published = ?,
             updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(fields.title, slug, fields.content, fields.excerpt, fields.published, id)
          .run();
        return res.meta.changes ? json({ id, slug }) : err(404, "post not found");
      }

      if (adminPost && method === "DELETE") {
        const gate = await requireAdmin(env, request);
        if (gate instanceof Response) return gate;
        const res = await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(adminPost[1]).run();
        return res.meta.changes ? json({ ok: true }) : err(404, "post not found");
      }

      return err(404, "not found");
    } catch (e) {
      return err(500, e instanceof Error ? e.message : "internal error");
    }
  },
};
