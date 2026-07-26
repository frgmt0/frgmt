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

/* the ambassador credential, same object as on the splash — cream
   sticker, official claude mark, anthropic's clay. Inline so the
   footer stays a single request with no extra asset fetch. */
const CLAUDE_MARK_PATH =
  "M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z";

function ambassadorBadge(): string {
  return `<a class="amb" href="https://claude.com/community/ambassadors" target="_blank" rel="noreferrer"
   aria-label="Claude Ambassador — students and educators vertical">
  <svg class="amb-mark" viewBox="0 0 248 248" role="img" aria-label="Claude" focusable="false"><path d="${CLAUDE_MARK_PATH}" fill="currentColor"/></svg>
  <span class="amb-text">
    <span class="amb-title">claude ambassador</span>
    <span class="amb-vert">students &amp; educators</span>
  </span>
  <span class="amb-perf" aria-hidden="true"></span>
</a>`;
}

function siteFooter(): string {
  return `<footer class="foot">
  <span class="rule" aria-hidden="true"></span>
  ${ambassadorBadge()}
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
