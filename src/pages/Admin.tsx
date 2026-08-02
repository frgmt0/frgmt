import { useEffect, useRef, useState } from "react";
import Chrome from "../Chrome";
import {
  adminList,
  createPost,
  deletePost,
  login,
  logout,
  me,
  updatePost,
  type Post,
  type PostDraft,
} from "../api";
import { renderMarkdown } from "../markdown";

const fmtDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("'", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/* ---------------- editor ---------------- */

type EditState =
  | { kind: "new" }
  | { kind: "edit"; post: Post };

/** Wrap the current textarea selection in markdown, or drop a placeholder. */
function applyWrap(ta: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const picked = value.slice(s, e) || placeholder;
  ta.setRangeText(before + picked + after, s, e, "end");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
  ta.setSelectionRange(s + before.length, s + before.length + picked.length);
}

function applyLine(ta: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const lineEnd = value.indexOf("\n", e);
  const block = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const next = block
    .split("\n")
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
    .join("\n");
  ta.setRangeText(next, lineStart, lineEnd === -1 ? value.length : lineEnd, "end");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
}

function Editor({
  state,
  onDone,
}: {
  state: EditState;
  onDone: (saved?: Post) => void;
}) {
  const source = state.kind === "edit" ? state.post : null;
  const [title, setTitle] = useState(source?.title ?? "");
  const [slug, setSlug] = useState(source?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(state.kind === "edit");
  const [excerpt, setExcerpt] = useState(source?.excerpt ?? "");
  const [content, setContent] = useState(source?.content ?? "");
  const [published, setPublished] = useState(!!source?.published);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const draftKey = `frgmt-draft-${source?.id ?? "new"}`;

  // an unsaved draft survives an accidental navigation
  useEffect(() => {
    if (source) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const d = JSON.parse(saved) as PostDraft;
        setTitle(d.title);
        setSlug(d.slug);
        setSlugTouched(!!d.slug);
        setExcerpt(d.excerpt);
        setContent(d.content);
        setPublished(d.published);
      } catch {
        /* a stale draft is not worth a crash */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (source) return;
    localStorage.setItem(draftKey, JSON.stringify({ title, slug, excerpt, content, published }));
  }, [title, slug, excerpt, content, published, source, draftKey]);

  const onTitle = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const save = async () => {
    setBusy(true);
    setProblem("");
    try {
      const draft: PostDraft = { title, slug, excerpt, content, published };
      const res = source ? await updatePost(source.id, draft) : await createPost(draft);
      localStorage.removeItem(draftKey);
      onDone({
        id: res.id,
        title,
        slug: res.slug,
        excerpt,
        content,
        published: published ? 1 : 0,
        created_at: source?.created_at ?? new Date().toISOString(),
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "save failed");
      setBusy(false);
    }
  };

  const ta = () => taRef.current!;
  const tools: { label: string; title: string; run: () => void }[] = [
    { label: "B", title: "Bold (⌘B)", run: () => applyWrap(ta(), "**", "**", "bold text") },
    { label: "I", title: "Italic (⌘I)", run: () => applyWrap(ta(), "*", "*", "italic text") },
    { label: "H2", title: "Heading", run: () => applyLine(ta(), "## ") },
    { label: "H3", title: "Subheading", run: () => applyLine(ta(), "### ") },
    {
      label: "<>",
      title: "Inline code",
      run: () => applyWrap(ta(), "`", "`", "code"),
    },
    {
      label: "{ }",
      title: "Code block",
      run: () => applyWrap(ta(), "```\n", "\n```", "code"),
    },
    {
      label: "a→",
      title: "Link (⌘K)",
      run: () => applyWrap(ta(), "[", "](https://)", "link text"),
    },
    { label: "❝", title: "Quote", run: () => applyLine(ta(), "> ") },
    { label: "•", title: "List", run: () => applyLine(ta(), "- ") },
    { label: "—", title: "Rule", run: () => applyWrap(ta(), "\n***\n", "", "") },
  ];

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      tools[0].run();
    } else if (mod && e.key === "i") {
      e.preventDefault();
      tools[1].run();
    } else if (mod && e.key === "k") {
      e.preventDefault();
      tools[6].run();
    } else if (mod && e.key === "s") {
      e.preventDefault();
      void save();
    } else if (e.key === "Tab") {
      e.preventDefault();
      applyWrap(ta(), "  ", "", "");
    }
  };

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <main id="main" className="bcol admin">
      <p className="more back">
        <a
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            onDone();
          }}
        >
          &larr; all posts
        </a>
      </p>

      <h1 className="key">{source ? `Editing “${source.title}”` : "New post"}</h1>

      <div className="field">
        <label htmlFor="f-title">Title</label>
        <input id="f-title" value={title} onChange={(e) => onTitle(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="f-slug">Slug</label>
          <input
            id="f-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="f-excerpt">Excerpt</label>
          <input
            id="f-excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Shown on the index"
          />
        </div>
      </div>

      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {tools.map((t) => (
          <button key={t.label} type="button" title={t.title} onClick={t.run} tabIndex={-1}>
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="tool-toggle"
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "write" : "preview"}
        </button>
      </div>

      {preview ? (
        <div className="prose preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      ) : (
        <textarea
          ref={taRef}
          className="pad"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write in markdown. ⌘S saves."
          spellCheck
        />
      )}

      <div className="editbar">
        <label className="check">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Live on /blog
        </label>
        <span className="spec">{words} words</span>
        <span className="editbar-actions">
          <button className="lamp" disabled={busy || !title.trim() || !content.trim()} onClick={save}>
            {busy ? "saving…" : source ? "save changes" : published ? "share live" : "save draft"}
          </button>
        </span>
      </div>
      {problem && <p className="problem">{problem}</p>}
    </main>
  );
}

/* ---------------- login + list ---------------- */

function Login({ onIn }: { onIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      const d = await login(username, password);
      onIn(d.username);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "sign in failed");
      setBusy(false);
    }
  };

  return (
    <main id="main" className="bcol">
      <h1 className="line">The door is locked.</h1>
      <form onSubmit={submit} className="login">
        <div className="field">
          <label htmlFor="u">Username</label>
          <input
            id="u"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input
            id="p"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="lamp" disabled={busy || !username || !password}>
          {busy ? "checking…" : "sign in"}
        </button>
        {problem && <p className="problem">{problem}</p>}
      </form>
    </main>
  );
}

export default function Admin() {
  const [who, setWho] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    document.title = "Admin — frgmt";
    me().then((m) => {
      setWho(m?.username ?? null);
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!who) return;
    adminList()
      .then(setPosts)
      .catch((e) => setProblem(e instanceof Error ? e.message : "could not load posts"));
  }, [who]);

  const onDone = () => {
    setEditing(null);
    adminList().then(setPosts).catch(() => {});
  };

  const remove = async (p: Post) => {
    if (!confirm(`Delete “${p.title}” for good?`)) return;
    try {
      await deletePost(p.id);
      setPosts((ps) => ps?.filter((x) => x.id !== p.id) ?? ps);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "delete failed");
    }
  };

  return (
    <Chrome>
      {!checked && (
        <main id="main" className="bcol">
          <p className="key">Checking the door…</p>
        </main>
      )}

      {checked && !who && <Login onIn={setWho} />}

      {checked && who && editing && <Editor state={editing} onDone={onDone} />}

      {checked && who && !editing && (
        <main id="main" className="bcol admin">
          <h1 className="line">The desk.</h1>

          <section>
            <h2 className="key">
              Posts{" "}
              <button className="lamp inline" onClick={() => setEditing({ kind: "new" })}>
                new post
              </button>
            </h2>

            {posts === null && !problem && <p className="key">Loading…</p>}
            {problem && <p className="problem">{problem}</p>}
            {posts?.length === 0 && <p className="key">Nothing yet. Write the first one.</p>}

            {posts?.map((p) => (
              <article className="entry" key={p.id}>
                <h3>
                  <a href={`/blog/${p.slug}`}>{p.title}</a>{" "}
                  <span className="spec">
                    {p.published ? "live" : "draft"} · {fmtDate(p.created_at)}
                  </span>
                </h3>
                <p className="more admin-actions">
                  <a
                    href={`/admin/edit/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setEditing({ kind: "edit", post: p });
                    }}
                  >
                    edit
                  </a>{" "}
                  <a
                    href={`/admin/delete/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      void remove(p);
                    }}
                  >
                    delete
                  </a>
                </p>
              </article>
            ))}
          </section>

          <p className="end">
            signed in as {who} ·{" "}
            <a
              href="/"
              onClick={async (e) => {
                e.preventDefault();
                await logout();
                location.href = "/";
              }}
            >
              sign out
            </a>
          </p>
        </main>
      )}
    </Chrome>
  );
}
