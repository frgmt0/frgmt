export interface PostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  created_at: string;
}

export interface Post extends PostSummary {
  content: string;
  updated_at?: string;
  published?: number;
}

/** Per-session CSRF secret, restored from /api/me on load. */
let csrf: string | null = null;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(csrf ? { "x-csrf": csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

export const listPosts = () => call<{ posts: PostSummary[] }>("/api/posts").then((d) => d.posts);

export const getPost = (slug: string) =>
  call<{ post: Post }>(`/api/posts/${encodeURIComponent(slug)}`).then((d) => d.post);

export async function me(): Promise<{ username: string } | null> {
  try {
    const d = await call<{ username: string; csrf: string }>("/api/me");
    csrf = d.csrf;
    return { username: d.username };
  } catch {
    return null;
  }
}

export async function login(username: string, password: string) {
  const d = await call<{ username: string; csrf: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  csrf = d.csrf;
  return { username: d.username };
}

export async function logout() {
  await call("/api/logout", { method: "POST" });
  csrf = null;
}

export const adminList = () =>
  call<{ posts: Post[] }>("/api/admin/posts").then((d) => d.posts);

export interface PostDraft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published: boolean;
}

export const createPost = (draft: PostDraft) =>
  call<{ id: string; slug: string }>("/api/admin/posts", {
    method: "POST",
    body: JSON.stringify(draft),
  });

export const updatePost = (id: string, draft: PostDraft) =>
  call<{ id: string; slug: string }>(`/api/admin/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });

export const deletePost = (id: string) =>
  call<{ ok: boolean }>(`/api/admin/posts/${id}`, { method: "DELETE" });
