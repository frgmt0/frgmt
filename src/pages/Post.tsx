import { useEffect, useState } from "react";
import Chrome from "../Chrome";
import { getPost, type Post } from "../api";
import { renderMarkdown } from "../markdown";

export default function PostPage({ slug }: { slug: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getPost(slug)
      .then((p) => {
        setPost(p);
        document.title = `${p.title} — frgmt`;
      })
      .catch(() => {
        setMissing(true);
        document.title = "Not found — frgmt";
      });
  }, [slug]);

  return (
    <Chrome>
      <main id="main" className="bcol">
        {!post && !missing && <p className="key">Loading…</p>}

        {missing && (
          <>
            <h1 className="line">There is no post at this address.</h1>
            <p>
              <a href="/blog">All posts</a>
            </p>
          </>
        )}

        {post && (
          <>
            <p className="more back">
              <a href="/blog">&larr; all posts</a>
            </p>
            <article>
              <h1 className="line">{post.title}</h1>
              <p className="key">
                {new Date(post.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <div
                className="prose"
                // renderMarkdown escapes before it transforms; output is safe
                dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
              />
            </article>
            <p className="end">
              <a href="/blog">More writing</a>
            </p>
          </>
        )}
      </main>
    </Chrome>
  );
}
