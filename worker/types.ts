export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export type Post = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  published: number;
  created_at: string;
  updated_at: string;
};
