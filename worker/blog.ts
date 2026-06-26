/* Public blog — server-rendered, reads published posts from kona-blog-db.
   Routes (all GET):
     /blog            index of published posts
     /blog/:slug      a single post
     /blog/blog.css   stylesheet (text module)
     /blog/torus.js   decorative ascii animation (text module) */

import type { Env, Post } from "./types";
import { escapeHtml, renderMarkdown } from "./markdown";
import BLOG_CSS from "./blog/styles.css";
import ASCII_JS from "./blog/ascii.txt";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const CSP =
  "default-src 'none'; " +
  "script-src 'self'; " +
  "style-src 'self' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "img-src 'self' https: data:; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "frame-ancestors 'none'";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")} · ${months[d.getUTCMonth()]}`;
}

function shell(opts: { title: string; description: string; body: string; canonical: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0c">
<meta name="color-scheme" content="dark">
<meta name="description" content="${escapeHtml(opts.description)}">
<link rel="canonical" href="${escapeHtml(opts.canonical)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<title>${escapeHtml(opts.title)}</title>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<div class="scan" aria-hidden="true"></div>
${opts.body}
<script src="/blog/ascii.js" defer></script>
</body>
</html>`;
}

function masthead(compact: boolean): string {
  return `<header class="mast${compact ? " compact" : ""}">
  <a class="mast-mark" href="/blog">frgmt<span class="slash">/</span>writing</a>
  <pre class="ascii-art" id="ascii" aria-hidden="true"></pre>
</header>`;
}

function siteFooter(): string {
  return `<footer class="foot">
  <span class="rule" aria-hidden="true"></span>
  <nav class="foot-nav">
    <a href="/">← frgmt.xyz</a>
    <a href="/blog">all writing</a>
    <a href="https://github.com/frgmt0">github</a>
  </nav>
</footer>`;
}

async function renderIndex(env: Env): Promise<Response> {
  const res = await env.DB.prepare(
    "SELECT id, title, slug, excerpt, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 200"
  ).all();
  const posts = res.results as unknown as Post[];

  const list = posts.length
    ? posts
        .map(
          (p, idx) => `<li class="entry">
  <a class="entry-link" href="/blog/${encodeURIComponent(p.slug)}">
    <span class="entry-idx" aria-hidden="true">${String(posts.length - idx).padStart(2, "0")}</span>
    <span class="entry-body">
      <span class="entry-title">${escapeHtml(p.title)}</span>
      ${p.excerpt ? `<span class="entry-excerpt">${escapeHtml(p.excerpt)}</span>` : ""}
    </span>
    <span class="entry-date">${fmtDate(p.created_at)}</span>
  </a>
</li>`
        )
        .join("\n")
    : `<li class="empty">nothing published yet.</li>`;

  const body = `${masthead(false)}
<main class="wrap">
  <p class="intro">notes, logs, and the occasional essay. newest first.</p>
  <span class="rule" aria-hidden="true"></span>
  <ol class="entries">
${list}
  </ol>
</main>
${siteFooter()}`;

  return html(
    shell({
      title: "frgmt / writing",
      description: "Notes, logs, and essays from frgmt0.",
      canonical: "https://frgmt.xyz/blog",
      body,
    })
  );
}

async function renderPost(env: Env, slug: string): Promise<Response> {
  const post = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND published = 1")
    .bind(slug)
    .first<Post>();
  if (!post) return notFound();

  const [prev, next] = await Promise.all([
    env.DB.prepare(
      "SELECT title, slug FROM posts WHERE published = 1 AND created_at < ? ORDER BY created_at DESC LIMIT 1"
    )
      .bind(post.created_at)
      .first<{ title: string; slug: string }>(),
    env.DB.prepare(
      "SELECT title, slug FROM posts WHERE published = 1 AND created_at > ? ORDER BY created_at ASC LIMIT 1"
    )
      .bind(post.created_at)
      .first<{ title: string; slug: string }>(),
  ]);

  const nav = `<nav class="post-nav">
  ${next ? `<a class="pn next" href="/blog/${encodeURIComponent(next.slug)}"><span>newer</span>${escapeHtml(next.title)}</a>` : `<span class="pn empty"></span>`}
  ${prev ? `<a class="pn prev" href="/blog/${encodeURIComponent(prev.slug)}"><span>older</span>${escapeHtml(prev.title)}</a>` : `<span class="pn empty"></span>`}
</nav>`;

  const body = `${masthead(true)}
<main class="wrap">
  <article class="post">
    <a class="back" href="/blog">← writing</a>
    <h1 class="post-title">${escapeHtml(post.title)}</h1>
    <p class="post-meta">${fmtDate(post.created_at)}${
      post.updated_at && post.updated_at.slice(0, 10) !== post.created_at.slice(0, 10)
        ? ` · updated ${fmtDate(post.updated_at)}`
        : ""
    }</p>
    <span class="rule" aria-hidden="true"></span>
    <div class="md">
${renderMarkdown(post.content)}
    </div>
  </article>
  ${nav}
</main>
${siteFooter()}`;

  return html(
    shell({
      title: `${post.title} — frgmt`,
      description: post.excerpt || `A post by frgmt0.`,
      canonical: `https://frgmt.xyz/blog/${post.slug}`,
      body,
    })
  );
}

function notFound(): Response {
  const body = `${masthead(true)}
<main class="wrap">
  <article class="post">
    <h1 class="post-title">404</h1>
    <p class="post-meta">that page isn't here.</p>
    <span class="rule" aria-hidden="true"></span>
    <p><a class="back" href="/blog">← back to writing</a></p>
  </article>
</main>
${siteFooter()}`;
  return html(
    shell({ title: "404 — frgmt", description: "Not found.", canonical: "https://frgmt.xyz/blog", body }),
    404
  );
}

function html(markup: string, status = 200): Response {
  return new Response(markup, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
      "Cache-Control": status === 200 ? "public, max-age=60, s-maxage=300" : "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

export async function handleBlog(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const { pathname } = url;

  if (pathname === "/blog/blog.css") {
    return new Response(BLOG_CSS, {
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
    });
  }
  if (pathname === "/blog/ascii.js") {
    return new Response(ASCII_JS, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
    });
  }
  if (pathname === "/blog" || pathname === "/blog/") return renderIndex(env);

  const m = pathname.match(/^\/blog\/([A-Za-z0-9_-]+)\/?$/);
  if (m) return renderPost(env, decodeURIComponent(m[1]));

  return notFound();
}
