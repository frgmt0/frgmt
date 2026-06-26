/* Posts CRUD over the existing `posts` table in kona-blog-db. */

import type { Env, Post } from "./types";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function genId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

// First non-empty, non-heading line of markdown, stripped of inline syntax.
export function deriveExcerpt(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(">") || line.startsWith("***") || line === "---")
      continue;
    const plain = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // images/links -> text
      .replace(/[*_`>#~]/g, "")
      .trim();
    if (plain) return plain.slice(0, 200);
  }
  return "";
}

async function uniqueSlug(env: Env, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const row = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first<{ id: string }>();
    if (!row || row.id === excludeId) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${genId()}`;
}

/* ---------- handlers (all return plain objects; router serializes) ---------- */

export async function listPosts(env: Env, url: URL): Promise<Post[]> {
  const status = url.searchParams.get("status") || "all"; // all | draft | published
  const q = (url.searchParams.get("q") || "").trim();

  const where: string[] = [];
  const binds: unknown[] = [];
  if (status === "draft") where.push("published = 0");
  else if (status === "published") where.push("published = 1");
  if (q) {
    where.push("(title LIKE ? OR slug LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    binds.push(like, like);
  }
  const sql =
    `SELECT id, title, slug, excerpt, published, created_at, updated_at,
            length(content) AS content_len
       FROM posts` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY created_at DESC LIMIT 500`;
  const res = await env.DB.prepare(sql).bind(...binds).all();
  return res.results as unknown as Post[];
}

export async function getPost(env: Env, id: string): Promise<Post | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Post>();
}

type PostInput = { title?: string; slug?: string; content?: string; excerpt?: string; published?: boolean };

export async function createPost(env: Env, input: PostInput): Promise<Post> {
  const title = (input.title || "").trim();
  const content = input.content ?? "";
  if (!title) throw new HttpError(400, "title is required");

  const id = genId();
  const slugBase = slugify(input.slug?.trim() || title);
  const slug = await uniqueSlug(env, slugBase);
  const excerpt = (input.excerpt?.trim() || deriveExcerpt(content)) || null;
  const published = input.published ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO posts (id, title, slug, content, excerpt, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(id, title, slug, content, excerpt, published)
    .run();

  return (await getPost(env, id))!;
}

export async function updatePost(env: Env, id: string, input: PostInput): Promise<Post> {
  const existing = await getPost(env, id);
  if (!existing) throw new HttpError(404, "post not found");

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  if (!title) throw new HttpError(400, "title cannot be empty");
  const content = input.content !== undefined ? input.content : existing.content;

  let slug = existing.slug;
  if (input.slug !== undefined && input.slug.trim()) {
    slug = await uniqueSlug(env, slugify(input.slug), id);
  } else if (input.title !== undefined && !input.slug) {
    // title changed and no explicit slug given: keep existing slug (stable URLs).
    slug = existing.slug;
  }

  const excerpt =
    input.excerpt !== undefined
      ? input.excerpt.trim() || deriveExcerpt(content) || null
      : existing.excerpt;
  const published = input.published !== undefined ? (input.published ? 1 : 0) : existing.published;

  await env.DB.prepare(
    `UPDATE posts SET title = ?, slug = ?, content = ?, excerpt = ?, published = ?, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(title, slug, content, excerpt, published, id)
    .run();

  return (await getPost(env, id))!;
}

export async function deletePost(env: Env, id: string): Promise<void> {
  const res = await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, "post not found");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
