/* ============================================================
   frgmt.xyz worker.

   Normal traffic (/, /assets/*, the splash SPA) is served straight from
   static assets — `run_worker_first` in wrangler.jsonc only routes /admin
   and /api/* here, so the splash is untouched.

   - /api/*   → JSON CMS API (auth + posts CRUD)
   - /admin   → self-contained admin app (login + editor)
   - else     → static assets (ASSETS binding)
   ============================================================ */

import type { Env } from "./types";
import {
  checkCsrf,
  clearCookie,
  clearLoginAttempts,
  clientIp,
  createSession,
  destroySession,
  getSession,
  isThrottled,
  recordFailedLogin,
  sessionCookie,
  verifyPassword,
  type Session,
} from "./auth";
import {
  createPost,
  deletePost,
  getPost,
  HttpError,
  listPosts,
  updatePost,
} from "./posts";
import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from "./admin";
import { handleBlog } from "./blog";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

const ADMIN_CSP =
  "default-src 'none'; " +
  "script-src 'self'; " +
  "style-src 'self'; " +
  "img-src 'self' https: data:; " +
  "connect-src 'self'; " +
  "font-src 'self'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'";

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    try {
      if (pathname.startsWith("/api/")) return await handleApi(req, env, url);
      if (pathname === "/admin" || pathname.startsWith("/admin/")) return handleAdmin(pathname);
      if (pathname === "/blog" || pathname.startsWith("/blog/")) {
        const res = await handleBlog(req, env, url);
        if (res) return res;
      }
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error("worker error", err);
      return json({ error: "internal error" }, 500);
    }

    // Anything else: static assets (the splash SPA).
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

/* ---------------- admin app (static, no build step) ---------------- */

function handleAdmin(pathname: string): Response {
  if (pathname === "/admin/app.js") {
    return new Response(ADMIN_JS, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  if (pathname === "/admin/app.css") {
    return new Response(ADMIN_CSS, {
      headers: { "Content-Type": "text/css; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  // /admin and any /admin/* deep link → the shell (client routes internally).
  return new Response(ADMIN_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": ADMIN_CSP,
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

/* ---------------- API ---------------- */

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get("Content-Type")?.includes("application/json") !== true) {
    throw new HttpError(415, "expected application/json");
  }
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "invalid JSON body");
}

// Require an authenticated session; for mutating verbs also require CSRF.
async function requireAuth(req: Request, env: Env): Promise<Session> {
  const session = await getSession(env, req);
  if (!session) throw new HttpError(401, "not authenticated");
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!checkCsrf(req, session)) throw new HttpError(403, "bad CSRF token");
  }
  return session;
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.slice("/api".length); // e.g. "/login", "/posts/abc"
  const method = req.method;

  // --- auth: login ---
  if (path === "/login" && method === "POST") {
    const ip = clientIp(req);
    if (await isThrottled(env, ip)) return json({ error: "too many attempts, try later" }, 429);

    const body = await readJson(req);
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");

    const user = await env.DB.prepare(
      "SELECT id, password_hash FROM admin_users WHERE username = ?"
    )
      .bind(username)
      .first<{ id: string; password_hash: string }>();

    // Always run a verify (real hash or a decoy) to keep timing uniform.
    const decoy = "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const ok = await verifyPassword(password, user?.password_hash ?? decoy);

    if (!user || !ok) {
      await recordFailedLogin(env, ip);
      return json({ error: "invalid credentials" }, 401);
    }

    await clearLoginAttempts(env, ip);
    const { token, csrf } = await createSession(env, user.id);
    return json({ ok: true, csrf, username }, 200, { "Set-Cookie": sessionCookie(token) });
  }

  // --- auth: logout ---
  if (path === "/logout" && method === "POST") {
    // CSRF-protected to prevent forced logout.
    const session = await getSession(env, req);
    if (session && !checkCsrf(req, session)) return json({ error: "bad CSRF token" }, 403);
    await destroySession(env, req);
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
  }

  // --- auth: current user + csrf ---
  if (path === "/me" && method === "GET") {
    const session = await getSession(env, req);
    if (!session) return json({ authenticated: false }, 200);
    return json({ authenticated: true, username: session.username, csrf: session.csrf });
  }

  // --- posts collection ---
  if (path === "/posts" && method === "GET") {
    await requireAuth(req, env);
    return json({ posts: await listPosts(env, url) });
  }
  if (path === "/posts" && method === "POST") {
    await requireAuth(req, env);
    const body = await readJson(req);
    const post = await createPost(env, normalizePostInput(body));
    return json({ post }, 201);
  }

  // --- single post ---
  const m = path.match(/^\/posts\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const id = m[1];
    if (method === "GET") {
      await requireAuth(req, env);
      const post = await getPost(env, id);
      if (!post) return json({ error: "post not found" }, 404);
      return json({ post });
    }
    if (method === "PUT" || method === "PATCH") {
      await requireAuth(req, env);
      const body = await readJson(req);
      const post = await updatePost(env, id, normalizePostInput(body));
      return json({ post });
    }
    if (method === "DELETE") {
      await requireAuth(req, env);
      await deletePost(env, id);
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

function normalizePostInput(body: Record<string, unknown>) {
  const out: {
    title?: string;
    slug?: string;
    content?: string;
    excerpt?: string;
    published?: boolean;
  } = {};
  if (typeof body.title === "string") out.title = body.title;
  if (typeof body.slug === "string") out.slug = body.slug;
  if (typeof body.content === "string") out.content = body.content;
  if (typeof body.excerpt === "string") out.excerpt = body.excerpt;
  if (typeof body.published === "boolean") out.published = body.published;
  return out;
}
