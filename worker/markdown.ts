/* Server-side markdown -> HTML for the public blog.
   Escapes first, then applies a small, safe subset (the same one the admin
   preview uses): headings, bold/italic/strike, inline code + fences, links,
   images, blockquotes, lists, hr, paragraphs. Output is XSS-safe: all text is
   HTML-escaped before any tags are introduced, and link/image URLs are
   protocol-checked. */

const SENT = "\u0000"; // placeholder sentinel — cannot appear in escaped text

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function inline(s: string): string {
  const tokens: string[] = [];
  const stash = (html: string) => `${SENT}${tokens.push(html) - 1}${SENT}`;

  // inline code first so its contents are never reformatted
  s = s.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${c}</code>`));
  // images ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    if (!/^(https?:|\/)/.test(url)) return alt;
    return stash(`<img src="${url}" alt="${alt}" loading="lazy">`);
  });
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
    const safe = /^(https?:|\/|#|mailto:)/.test(url) ? url : "#";
    const ext = /^https?:/.test(safe);
    return stash(
      `<a href="${safe}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${txt}</a>`
    );
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\s][^_]*?)_/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return s.replace(new RegExp(SENT + "(\\d+)" + SENT, "g"), (_, i) => tokens[+i] ?? "");
}

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src || "").split("\n");
  const out: string[] = [];
  let i = 0;

  const isBlank = (l: string) => /^\s*$/.test(l);
  const isHr = (l: string) => /^\s*(\*\*\*+|---+|___+)\s*$/.test(l);

  const list = (tag: string, items: string[]) =>
    out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }
    if (isBlank(line)) { i++; continue; }
    if (isHr(line)) { out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }

    if (/^\s*&gt;\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*&gt;\s?/, ""));
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const u: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) u.push(lines[i++].replace(/^\s*[-*+]\s+/, ""));
      list("ul", u);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const o: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) o.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      list("ol", o);
      continue;
    }

    const p: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !isHr(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*&gt;\s?/.test(lines[i])
    ) {
      p.push(lines[i++]);
    }
    out.push(`<p>${inline(p.join("<br>"))}</p>`);
  }

  return out.join("\n");
}
