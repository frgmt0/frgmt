import { useEffect, useMemo, useRef, useState } from "react";
import Blob from "./Blob";
import Marks from "./Marks";
import Typewriter, { typo, type Op } from "./Typewriter";
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
  const [ready, setReady] = useState(false); // fetch settled (or timed out)
  const [booted, setBooted] = useState(false); // boot assembly may begin

  const rowsRef = useRef(new Map<string, HTMLElement>());
  const strataRef = useRef(new Map<number, HTMLElement>());
  const railYearRef = useRef<HTMLSpanElement | null>(null);

  // ---- data ----
  useEffect(() => {
    let cancelled = false;
    const settle = () => {
      if (!cancelled) setReady(true);
    };
    const safety = setTimeout(settle, 1600); // never let typing wait forever
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
      } finally {
        clearTimeout(safety);
        settle();
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, []);

  // ---- boot gate: hold the assembly until the display font is in ----
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      requestAnimationFrame(() => setBooted(true));
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(go).catch(go);
    const t = setTimeout(go, 600); // fallback if fonts.ready never resolves
    return () => clearTimeout(t);
  }, []);

  const sorted = useMemo(
    () =>
      [...repos].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
    [repos]
  );

  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((r, i) => m.set(r.name, i));
    return m;
  }, [sorted]);

  const byYear = useMemo(() => {
    const groups = new Map<number, NormalizedRepo[]>();
    for (const r of sorted) {
      const y = yearOf(r.updated_at);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(r);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [sorted]);

  // marquee content from real data
  const langs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of sorted) if (r.language) counts.set(r.language, (counts.get(r.language) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
  }, [sorted]);

  const marquee = useMemo(() => {
    const parts = [
      "THE INDEX",
      `${sorted.length} FRAGMENTS`,
      "GITHUB.COM/FRGMT0",
      ...langs.map((l) => l.toUpperCase()),
      "34.0522°N 118.2437°W",
    ];
    return parts.join("  /  ");
  }, [sorted.length, langs]);

  // ---- typed scripts ----
  // hero tagline: a person fiddling with copy — typo+fix, a pause, a cut.
  const taglineScript = useMemo<Op[]>(
    () => [
      { op: "type", text: "we " },
      ...typo("biuld", "build"),
      { op: "type", text: " digital experiences" },
      { op: "pause", ms: 760 },
      { op: "selBack", n: "experiences".length },
      { op: "cut" },
      { op: "pause", ms: 360 },
      { op: "type", text: "fragments." },
    ],
    []
  );

  // topline status: a terminal edit that cuts a path, swaps the command,
  // pastes the path back — then appends the *real* fetch result.
  const statusScript = useMemo<Op[]>(() => {
    const tail =
      source === "live"
        ? `  ·  ${sorted.length} live`
        : `  ·  snapshot · ${sorted.length}`;
    return [
      { op: "type", text: "curl github.com/frgmt0", cps: 24 },
      { op: "pause", ms: 520 },
      { op: "selBack", n: "github.com/frgmt0".length },
      { op: "cut" },
      { op: "pause", ms: 220 },
      { op: "back", n: "curl ".length },
      { op: "pause", ms: 180 },
      { op: "type", text: "open ", cps: 22 },
      { op: "paste" },
      { op: "pause", ms: 420 },
      { op: "type", text: tail, cps: 26 },
    ];
  }, [source, sorted.length]);

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

  return (
    <>
      <Marks />
      <div className={`site${booted ? " is-booted" : ""}`}>
        <header className="topline">
          <span className="topline-brand boot boot-1">frgmt.xyz</span>
          <span className="topline-status boot boot-1">
            <span className="prompt" aria-hidden="true">
              →
            </span>
            <Typewriter
              script={statusScript}
              start={booted && ready}
              caretAtRest={false}
              className="tw tw-mono"
              ariaLabel={
                source === "live"
                  ? `${sorted.length} repositories, live from github`
                  : `${sorted.length} repositories, bundled snapshot`
              }
            />
          </span>
        </header>

        <section className="hero" aria-label="Introduction">
          <Blob />

          <div className="hero-inner">
            <h1 className="word boot" aria-label="frgmt">
              <span className="word-size" aria-hidden="true">
                frgmt
              </span>
              <span className="word-shard ws-ghost" aria-hidden="true">
                <span className="word-piece" style={{ animationDelay: "40ms" }}>
                  frgmt
                </span>
              </span>
              <span className="word-shard ws-a" aria-hidden="true">
                <span className="word-piece" style={{ animationDelay: "120ms" }}>
                  frgmt
                </span>
              </span>
              <span className="word-shard ws-b" aria-hidden="true">
                <span className="word-piece" style={{ animationDelay: "210ms" }}>
                  frgmt
                </span>
              </span>
              <span className="word-shard ws-c" aria-hidden="true">
                <span className="word-piece" style={{ animationDelay: "300ms" }}>
                  frgmt
                </span>
              </span>
            </h1>

            <p className="tagline boot boot-3">
              <Typewriter
                script={taglineScript}
                start={booted}
                className="tw tw-tag"
              />
            </p>
          </div>

          <span className="hero-edge boot boot-2" aria-hidden="true">
            34.0522°N · 118.2437°W
          </span>

          <div className="descend boot boot-3" aria-hidden="true">
            <span className="descend-label">scroll</span>
            <span className="descend-line" />
          </div>
        </section>

        <div className="marquee boot boot-2" aria-hidden="true">
          <div className="marquee-track">
            <span>{marquee}</span>
            <span>{marquee}</span>
            <span>{marquee}</span>
          </div>
        </div>

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
            {byYear.map(([year, list], gi) => (
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
                    [{String(list.length).padStart(2, "0")}]
                  </span>
                </header>

                {list.map((r, ri) => {
                  const n = indexOf.get(r.name) ?? gi * 100 + ri;
                  return (
                    <article
                      key={r.name}
                      className="row"
                      ref={(el) => {
                        if (el) rowsRef.current.set(r.name, el);
                        else rowsRef.current.delete(r.name);
                      }}
                    >
                      <span className="row-no" aria-hidden="true">
                        {String(n + 1).padStart(2, "0")}
                      </span>
                      <span className="row-date">{formatDate(r.updated_at)}</span>
                      <div className="row-main">
                        <h3 className="row-name">
                          <a href={r.url}>{r.name}</a>
                        </h3>
                        {r.description && <p className="row-desc">{r.description}</p>}
                      </div>
                      <div className="row-meta">
                        {r.language && <span className="row-lang">{r.language}</span>}
                        {r.stars > 0 && <span className="row-stars">★ {r.stars}</span>}
                        {r.homepage && (
                          <a className="row-site" href={r.homepage} aria-label="visit site">
                            ↗
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </section>

        <footer className="end">
          <p>
            Pulled live from <a href="https://github.com/frgmt0">github.com/frgmt0</a> on
            load; falls back to a bundled snapshot when github won't answer.
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
