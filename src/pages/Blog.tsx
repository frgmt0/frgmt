import { useEffect, useState } from "react";
import Chrome from "../Chrome";
import { listPosts, type PostSummary } from "../api";

const fmtDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/**
 * The index. The newest post is set like the one large line on the home
 * page; everything older drops into the wall-label list beneath it, newest
 * first, so the order to read in is the order on the page.
 */
export default function Blog() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = "Blog — frgmt";
    listPosts()
      .then(setPosts)
      .catch(() => setFailed(true));
  }, []);

  const [latest, ...rest] = posts ?? [];

  return (
    <Chrome>
      <main id="main" className="bcol">
        <h1 className="line">Writing, in the order it happened.</h1>

        {posts === null && !failed && <p className="key">Loading…</p>}
        {failed && <p className="key">The posts could not be loaded.</p>}
        {posts?.length === 0 && <p className="key">Nothing published yet.</p>}

        {latest && (
          <article className="latest">
            <h2 className="key">Latest</h2>
            <a className="latest-title" href={`/blog/${latest.slug}`}>
              {latest.title}
            </a>
            <p className="latest-meta">{fmtDate(latest.created_at)}</p>
            {latest.excerpt && <p>{latest.excerpt}</p>}
            <p className="more">
              <a href={`/blog/${latest.slug}`}>Read this one first</a>
            </p>
          </article>
        )}

        {rest.length > 0 && (
          <section aria-label="Earlier posts">
            <h2 className="key">Earlier</h2>
            {rest.map((p) => (
              <article className="entry" key={p.id}>
                <h3>
                  <a href={`/blog/${p.slug}`}>{p.title}</a>{" "}
                  <span className="spec">{fmtDate(p.created_at)}</span>
                </h3>
                {p.excerpt && <p>{p.excerpt}</p>}
              </article>
            ))}
          </section>
        )}

        <p className="end">
          <a href="/">frgmt.xyz</a>
        </p>
      </main>
    </Chrome>
  );
}
