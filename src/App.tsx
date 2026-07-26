import { useEffect, useState } from "react";
import Ascii from "./Ascii";
import Badge from "./Badge";
import Goose from "./Goose";

/* ============================================================
   frgmt.xyz — the splash.
   Off-black screen, monospace, one red. The page renders as-is:
   no intro sequence, no typing. The only motion is the ascii knot
   turning on the side. Project rows render from a bundled snapshot
   first, then refresh live from the GitHub API.
   ============================================================ */

type Project = {
  /** owner/name on github — also the react key */
  repo: string;
  name: string;
  desc: string;
  language: string;
  stars: number;
  url: string;
  /** who ships it, when that isn't just me */
  note?: string;
  /** shown next to the repo link, e.g. a site or an X handle */
  links?: { label: string; href: string }[];
  updated: string;
};

/* bundled snapshots — the page renders these instantly, then each
   row refreshes from the GitHub API. `repo` is the api path. */
const PROJECTS: Project[] = [
  {
    repo: "0xbeckett/beckett",
    name: "beckett",
    desc: "Agentic Discord coworker daemon — it lives in the channel and does the work.",
    language: "TypeScript",
    stars: 5,
    url: "https://github.com/0xbeckett/beckett",
    note: "ressac",
    links: [
      { label: "0xbeckett.me", href: "https://0xbeckett.me" },
      { label: "@beckposting", href: "https://x.com/beckposting" },
    ],
    updated: "2026-07-26",
  },
  {
    repo: "frgmt0/typer",
    name: "typer",
    desc: "Local, on-device autocomplete for macOS — inline AI completions via llama.cpp, no cloud.",
    language: "Swift",
    stars: 3,
    url: "https://github.com/frgmt0/typer",
    updated: "2026-06-21",
  },
];

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>(PROJECTS);

  // projects, live — each row falls back to its bundled snapshot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await Promise.all(
        PROJECTS.map(async (snap) => {
          try {
            const r = await fetch(`https://api.github.com/repos/${snap.repo}`, {
              headers: { Accept: "application/vnd.github+json" },
            });
            if (!r.ok) return snap;
            const d = await r.json();
            if (!d?.name) return snap;
            return {
              ...snap,
              name: d.name,
              desc: d.description || snap.desc,
              language: d.language || snap.language,
              stars: d.stargazers_count ?? snap.stars,
              url: d.html_url || snap.url,
              updated: d.pushed_at || snap.updated,
            };
          } catch {
            return snap; /* keep snapshot */
          }
        })
      );
      if (!cancelled) setProjects(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="term">
      <div className="scan" aria-hidden="true" />

      <main className="term-grid">
        <section className="term-main">
          <h1 className="jw" aria-label="jw — jason w">
            <span className="jw-mark">jw</span>
          </h1>

          <p className="lead">jason w · engineer · los angeles</p>

          <div className="bio">
            <p>i ship small, finishable tools.</p>
            <p className="bio-role">
              founder @{" "}
              <a href="https://rssc.frgmt.xyz" target="_blank" rel="noreferrer">
                ressac
              </a>
            </p>
            <p className="bio-stack">rust · swift · typescript · python</p>
          </div>

          <Badge />

          <div className="now">
            <span className="now-tag">now</span>
            <span className="now-rule" />
          </div>

          <div className="projs">
            {projects.map((p) => (
              <section className="proj" aria-label={p.name} key={p.repo}>
                <div className="proj-head">
                  <h2 className="proj-name">{p.name}</h2>
                  {p.note && <span className="proj-note">{p.note}</span>}
                  <span className="proj-meta">
                    {p.language.toLowerCase()} · ★{p.stars} · {fmtDate(p.updated)}
                  </span>
                </div>
                <div className="proj-body">
                  <p className="proj-desc">{p.desc}</p>
                  <div className="proj-links">
                    <a className="proj-link" href={p.url}>
                      → {p.url.replace(/^https?:\/\//, "")}
                    </a>
                    {p.links?.map((l) => (
                      <a
                        className="proj-link alt"
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>

          <a className="blog-cta" href="/blog">
            read the blog <span aria-hidden="true">→</span>
          </a>

          <nav className="links" aria-label="contact">
            <a className="mailto" href="mailto:hello@frgmt.xyz">
              hello@frgmt.xyz
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://x.com/jawrooo_" target="_blank" rel="noreferrer">
              @jawrooo_
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://github.com/frgmt0" target="_blank" rel="noreferrer">
              frgmt0
            </a>
          </nav>
        </section>

        <aside className="term-side" aria-hidden="true">
          <Ascii />
        </aside>
      </main>

      {/* the gag: a goose keeps dragging pug memes in. click one to
          bin it — the goose does not take it well. */}
      <Goose />
    </div>
  );
}
