import { useEffect, useMemo, useRef, useState } from "react";
import FragmentField from "./FragmentField";
import { fallbackRepos, type Repo } from "./repos";

type NormalizedRepo = {
  name: string;
  description: string;
  language: string;
  stars: number;
  url: string;
  homepage: string;
  updated_at: string;
};

type GitHubRepo = {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  homepage: string | null;
  updated_at: string;
};

function normalizeRepo(repo: Repo | GitHubRepo): NormalizedRepo {
  if ("html_url" in repo) {
    return {
      name: repo.name,
      description: repo.description || "",
      language: repo.language || "",
      stars: repo.stargazers_count || 0,
      url: repo.html_url,
      homepage: repo.homepage || "",
      updated_at: repo.updated_at || "",
    };
  }
  return {
    name: repo.name,
    description: repo.description || "",
    language: repo.language || "",
    stars: repo.stars,
    url: repo.url,
    homepage: repo.homepage,
    updated_at: repo.updated_at,
  };
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function yearOf(iso: string) {
  return iso ? new Date(iso).getFullYear() : 0;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default function App() {
  const [repos, setRepos] = useState<NormalizedRepo[]>(() => fallbackRepos.map(normalizeRepo));
  const [source, setSource] = useState<"snapshot" | "live">("snapshot");

  const rowsRef = useRef(new Map<string, HTMLElement>());
  const strataRef = useRef(new Map<number, HTMLElement>());
  const railYearRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          "https://api.github.com/users/frgmt0/repos?per_page=100&sort=updated",
          { headers: { Accept: "application/vnd.github+json" } }
        );
        if (!response.ok) throw new Error("github did not answer");
        const data = (await response.json()) as GitHubRepo[];
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        setRepos(data.map(normalizeRepo));
        setSource("live");
      } catch {
        if (!cancelled) setSource("snapshot");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...repos].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
    [repos]
  );

  const byYear = useMemo(() => {
    const groups = new Map<number, NormalizedRepo[]>();
    for (const r of sorted) {
      const y = yearOf(r.updated_at);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(r);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [sorted]);

  const totalStars = useMemo(() => sorted.reduce((s, r) => s + r.stars, 0), [sorted]);
  const last = sorted[0];

  // Scene engine: one rAF loop drives pointer parallax (--px/--py on :root),
  // per-row focal depth (--f), the depth gauge (--depth), and the rail's
  // current-stratum label. Direct DOM writes — no React state per frame.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let raf = 0;
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let lastYear = "";
    let rows: { el: HTMLElement; top: number; f: number }[] = [];
    let strata: { year: number; top: number }[] = [];
    let docH = 1;

    const measure = () => {
      const sy = window.scrollY;
      rows = [...rowsRef.current.values()].map((el) => ({
        el,
        top: el.getBoundingClientRect().top + sy,
        f: -1,
      }));
      strata = [...strataRef.current.entries()]
        .map(([year, el]) => ({ year, top: el.getBoundingClientRect().top + sy }))
        .sort((a, b) => a.top - b.top);
      docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };

    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const frame = () => {
      if (!reduced) {
        px += (tx - px) * 0.06;
        py += (ty - py) * 0.06;
        root.style.setProperty("--px", px.toFixed(4));
        root.style.setProperty("--py", py.toFixed(4));
      }

      const sy = window.scrollY;
      const vh = window.innerHeight;
      const focal = sy + vh * 0.88;
      const falloff = vh * 0.34;

      for (const r of rows) {
        const f = reduced ? 1 : clamp01(1 - (r.top - focal) / falloff);
        if (Math.abs(f - r.f) > 0.004) {
          r.el.style.setProperty("--f", f.toFixed(3));
          r.f = f;
        }
      }

      root.style.setProperty("--depth", (sy / docH).toFixed(4));

      let current = strata[0]?.year;
      for (const s of strata) if (s.top <= sy + vh * 0.5) current = s.year;
      const label = current ? String(current) : "";
      if (label !== lastYear && railYearRef.current) {
        railYearRef.current.textContent = label;
        lastYear = label;
      }

      raf = requestAnimationFrame(frame);
    };

    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    window.addEventListener("pointermove", onPointer, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [sorted]);

  // cursor spotlight coordinates, per row
  const onRowMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <>
      <FragmentField />
      <div className="site">
        <header className="topline">
          <span className="topline-brand">frgmt.xyz</span>
          <span className="topline-status">
            <span className={`dot${source === "live" ? " dot-live" : ""}`} aria-hidden="true" />
            {source === "live" ? "live from github" : "bundled snapshot"}
          </span>
        </header>

        <section className="hero" aria-label="Introduction">
          <div className="hero-kicker">
            <p className="hero-id">ro_frgmt · developer · los angeles</p>
            <p className="hero-line">
              Every public repo from{" "}
              <a href="https://github.com/frgmt0">github.com/frgmt0</a> — newest at the
              surface. Dig down for the older strata.
            </p>
          </div>

          <div className="hero-stats" aria-label="Index totals">
            <span>{sorted.length} fragments</span>
            <span>{totalStars} stars</span>
            {last && (
              <span>
                last push {formatDate(last.updated_at)} ·{" "}
                <a href={last.url}>{last.name}</a>
              </span>
            )}
          </div>

          <h1 className="shard">
            <span className="shard-sizer">frgmt</span>
            <span className="shard-layer shard-ghost" aria-hidden="true">
              frgmt
            </span>
            <span className="shard-layer shard-cut-a" aria-hidden="true">
              frgmt
            </span>
            <span className="shard-layer shard-cut-b" aria-hidden="true">
              frgmt
            </span>
            <span className="shard-layer shard-cut-c" aria-hidden="true">
              frgmt
            </span>
          </h1>

          <span className="hero-edge" aria-hidden="true">
            34.0522°N · 118.2437°W
          </span>

          <div className="descend" aria-hidden="true">
            <span className="descend-label">descend</span>
            <span className="descend-line" />
          </div>
        </section>

        <section className="dig" aria-label="Repository index">
          <aside className="rail" aria-hidden="true">
            <span className="rail-cap">now</span>
            <span className="rail-line">
              <span className="rail-fill" />
              <span className="rail-dot" />
            </span>
            <span className="rail-year" ref={railYearRef} />
          </aside>

          <div className="strata">
            {byYear.map(([year, list]) => (
              <section
                key={year}
                className="stratum"
                ref={(el) => {
                  if (el) strataRef.current.set(year, el);
                  else strataRef.current.delete(year);
                }}
              >
                <span className="stratum-ghost" aria-hidden="true">
                  {year}
                </span>
                <header className="stratum-head">
                  <span className="stratum-year">{year}</span>
                  <span className="stratum-rule" aria-hidden="true" />
                  <span className="stratum-count">
                    {list.length} {list.length === 1 ? "fragment" : "fragments"}
                  </span>
                </header>

                {list.map((r) => (
                  <article
                    key={r.name}
                    className="row"
                    onPointerMove={onRowMove}
                    ref={(el) => {
                      if (el) rowsRef.current.set(r.name, el);
                      else rowsRef.current.delete(r.name);
                    }}
                  >
                    <span className="row-date">{formatDate(r.updated_at)}</span>
                    <div className="row-main">
                      <h3 className="row-name">
                        <a href={r.url}>{r.name}</a>
                      </h3>
                      {r.description && <p className="row-desc">{r.description}</p>}
                    </div>
                    <div className="row-meta">
                      {r.language && <span className="row-lang">{r.language}</span>}
                      {r.stars > 0 && (
                        <span className="row-stars">
                          {r.stars} {r.stars === 1 ? "star" : "stars"}
                        </span>
                      )}
                      {r.homepage && (
                        <a className="row-live" href={r.homepage}>
                          live
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        <footer className="end">
          <p>
            Pulled live from <a href="https://github.com/frgmt0">github.com/frgmt0</a> on
            load; falls back to a bundled snapshot when github won't answer. Bedrock
            reached.
          </p>
          <p className="end-links">
            <a href="https://github.com/frgmt0">github</a>
            <a href="https://kcodes.me">kcodes.me</a>
          </p>
        </footer>
      </div>
    </>
  );
}
