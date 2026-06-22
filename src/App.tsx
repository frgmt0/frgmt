import { useEffect, useRef, useState } from "react";
import Ascii from "./Ascii";
import Jw from "./Jw";
import Typewriter, { resolve, typo, type Op } from "./Typewriter";

/* ============================================================
   frgmt.xyz — a page that types itself out.
   The jw mark auditions typefaces, then the copy is typed one line
   at a time at a human pace — pauses, typos, corrections. A cursor
   drags a (real, random) pug in for no reason. SKIP cuts to the end.
   ============================================================ */

type Project = {
  name: string;
  desc: string;
  language: string;
  stars: number;
  url: string;
  updated: string;
};

const TYPER: Project = {
  name: "typer",
  desc: "Local, on-device autocomplete for macOS — inline AI completions via llama.cpp, no cloud.",
  language: "Swift",
  stars: 3,
  url: "https://github.com/frgmt0/typer",
  updated: "2026-06-21",
};

// typed lines — one at a time, with a typo the typist goes back and fixes
const SC: Record<string, Op[]> = {
  lead: [
    { op: "type", text: "jason w · " },
    ...typo("enginer", "engineer"),
    { op: "type", text: " · los angeles" },
  ],
  bio: [
    { op: "type", text: "i ship small, " },
    ...typo("finishble", "finishable"),
    { op: "type", text: " tools." },
  ],
  stack: [{ op: "type", text: "rust · swift · typescript · python" }],
};

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
};

export default function App() {
  const [proj, setProj] = useState<Project>(TYPER);
  const [dogUrl, setDogUrl] = useState<string | null>(null);
  const [dogIn, setDogIn] = useState(false);
  const [phase, setPhase] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [done, setDone] = useState(false);
  const [fontCaption, setFontCaption] = useState("");

  const gateRef = useRef<(() => void) | null>(null);
  const auditionRef = useRef<(() => void) | null>(null);
  const directorRef = useRef<{ cancel: () => void } | null>(null);
  const cursorRef = useRef<SVGSVGElement | null>(null);
  const dogRef = useRef<HTMLDivElement | null>(null);
  const dogUrlRef = useRef<string | null>(null);
  dogUrlRef.current = dogUrl;

  // typer, live
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("https://api.github.com/repos/frgmt0/typer", {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled || !d?.name) return;
        setProj({
          name: d.name,
          desc: d.description || TYPER.desc,
          language: d.language || TYPER.language,
          stars: d.stargazers_count ?? TYPER.stars,
          url: d.html_url || TYPER.url,
          updated: d.pushed_at || TYPER.updated,
        });
      } catch {
        /* keep snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // a real, random pug from the interwebs, to drag in later
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("https://dog.ceo/api/breed/pug/images/random");
        const d = await r.json();
        if (!cancelled && d?.status === "success" && d.message) setDogUrl(d.message);
      } catch {
        /* no dog, no drag — the build just skips it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalize = () => {
    setSkipped(true);
    setPhase(99);
    setDone(true);
    setDogIn(true);
    setFontCaption("font: archivo ✓");
    const c = cursorRef.current;
    if (c) c.style.opacity = "0";
    const dog = dogRef.current;
    if (dog) dog.style.transform = "";
  };

  // director
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finalize();
      return;
    }

    let alive = true;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        timers.push(setTimeout(res, ms));
      });
    const gate = (ref: { current: (() => void) | null }, maxMs: number) =>
      Promise.race([
        new Promise<void>((res) => {
          ref.current = res;
        }),
        sleep(maxMs),
      ]);

    // synthetic cursor (only used for the dog drag)
    const cur = cursorRef.current;
    let cx = -80;
    let cy = -80;
    const place = (x: number, y: number, press = false) => {
      cx = x;
      cy = y;
      if (cur) {
        cur.style.transform = `translate(${x - 2}px, ${y - 1}px)`;
        cur.dataset.press = press ? "1" : "";
      }
    };
    const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const moveTo = (
      tx: number,
      ty: number,
      ms: number,
      onP?: (e: number, x: number, y: number) => void,
      press = false
    ) =>
      new Promise<void>((res) => {
        const sx = cx;
        const sy = cy;
        const t0 = performance.now();
        const paint = (now: number) => {
          if (!alive) return;
          const p = Math.min(1, (now - t0) / ms);
          const e = easeInOut(p);
          place(sx + (tx - sx) * e, sy + (ty - sy) * e, press);
          onP?.(e, cx, cy);
          if (p < 1) raf = requestAnimationFrame(paint);
        };
        raf = requestAnimationFrame(paint);
        timers.push(
          setTimeout(() => {
            cancelAnimationFrame(raf);
            place(tx, ty, press);
            onP?.(1, tx, ty);
            res();
          }, ms)
        );
      });

    const dragDog = async () => {
      const dog = dogRef.current;
      if (!dogUrlRef.current || !dog || !cur) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const r = dog.getBoundingClientRect();
      const home = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      cur.style.opacity = "1";
      place(W * 0.08, H * 1.05);
      await moveTo(W * 0.08, H * 0.86, 700);
      if (!alive) return;
      place(cx, cy, true); // grab
      dog.style.opacity = "1";
      await sleep(160);
      await moveTo(
        home.x,
        home.y,
        1250,
        (e, x, y) => {
          const s = 0.18 + 0.82 * e;
          dog.style.transform = `translate(${x - home.x}px, ${y - home.y}px) scale(${s}) rotate(${(1 - e) * 14 - 4}deg)`;
        },
        true
      );
      if (!alive) return;
      place(cx, cy, false); // drop
      dog.style.transform = ""; // settle to css rest (a slight tilt)
      setDogIn(true);
      await sleep(260);
      await moveTo(W + 80, H * 0.8, 800);
      if (cur) cur.style.opacity = "0";
    };

    directorRef.current = {
      cancel: () => {
        alive = false;
        cancelAnimationFrame(raf);
        for (const t of timers) clearTimeout(t);
      },
    };

    (async () => {
      await sleep(420);
      if (!alive) return;

      setPhase(2); // jw + audition
      await gate(auditionRef, 4000);
      if (!alive) return;
      await sleep(150);

      setPhase(3); // lead
      await gate(gateRef, 45000);
      if (!alive) return;
      await sleep(60);

      setPhase(4); // bio
      await gate(gateRef, 45000);
      if (!alive) return;
      await sleep(60);

      setPhase(5); // stack
      await gate(gateRef, 45000);
      if (!alive) return;
      await sleep(140);

      setPhase(6); // now divider
      await sleep(200);

      setPhase(7); // typer name
      await gate(gateRef, 20000);
      if (!alive) return;
      setPhase(8); // project body
      await sleep(420);

      setPhase(9); // ascii
      await sleep(620);

      await dragDog(); // the gag
      if (!alive) return;

      setPhase(11); // links
      await sleep(200);
      setDone(true);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    directorRef.current?.cancel();
    finalize();
  };

  // typed line that resolves to static text once skipped
  const tline = (script: Op[], n: number, cls = "") => {
    if (skipped) return <span className={cls}>{resolve(script)}</span>;
    if (phase < n)
      return (
        <span className={cls} style={{ visibility: "hidden" }}>
          {resolve(script)}
        </span>
      );
    return (
      <Typewriter
        key={n}
        script={script}
        start
        caretAtRest={false}
        className={cls}
        ariaLabel={resolve(script)}
        onDone={() => gateRef.current?.()}
      />
    );
  };

  const vis = (n: number) => skipped || phase >= n;

  return (
    <div className="term" data-done={done ? "1" : undefined}>
      <div className="scan" aria-hidden="true" />

      {!done && (
        <button className="skip-float" type="button" onClick={skip}>
          skip <span aria-hidden="true">→</span>
        </button>
      )}

      <main className="term-grid">
        <section className="term-main">
          <h1 className={`jw${vis(2) ? " in" : ""}`} aria-label="jw — jason w">
            <Jw
              start={phase >= 2}
              skip={skipped}
              onLocked={() => auditionRef.current?.()}
              onCaption={setFontCaption}
            />
            <span className="jw-cap" aria-hidden="true">
              {fontCaption}
            </span>
          </h1>

          <p className="lead">{tline(SC.lead, 3, "lead-line")}</p>

          <div className="bio">
            <p>{tline(SC.bio, 4, "bio-line")}</p>
            <p>{tline(SC.stack, 5, "bio-stack")}</p>
          </div>

          <div className={`now${vis(6) ? " in" : ""}`} aria-hidden={!vis(6)}>
            <span className="now-tag">now</span>
            <span className="now-rule" />
          </div>

          <section className="proj" aria-label={proj.name}>
            <div className="proj-head">
              <h2 className="proj-name">
                {skipped ? (
                  <span>{proj.name}</span>
                ) : phase >= 7 ? (
                  <Typewriter
                    key="pn"
                    script={[{ op: "type", text: proj.name }]}
                    start
                    caretAtRest={false}
                    ariaLabel={proj.name}
                    onDone={() => gateRef.current?.()}
                  />
                ) : (
                  <span style={{ visibility: "hidden" }}>{proj.name}</span>
                )}
              </h2>
              <span className={`proj-meta${vis(8) ? " in" : ""}`}>
                {proj.language.toLowerCase()} · ★{proj.stars} · {fmtDate(proj.updated)}
              </span>
            </div>
            <div className={`proj-body${vis(8) ? " in" : ""}`}>
              <p className="proj-desc">{proj.desc}</p>
              <a className="proj-link" href={proj.url}>
                → github.com/frgmt0/typer
              </a>
            </div>
          </section>

          <nav className={`links${vis(11) ? " in" : ""}`} aria-label="links">
            <a href="https://github.com/frgmt0">github</a>
            <span aria-hidden="true">·</span>
            <a href="https://kcodes.me">kcodes.me</a>
          </nav>
        </section>

        <aside className={`term-side${vis(9) ? " in" : ""}`} aria-hidden="true">
          <Ascii run={vis(9)} />
          <span className="side-cap">ascii · torus</span>
        </aside>
      </main>

      {/* the gag: a real random pug, dragged in */}
      <div className={`dog${dogIn ? " in" : ""}`} ref={dogRef} aria-hidden="true">
        {dogUrl && <img src={dogUrl} alt="" draggable={false} />}
        <span className="dog-cap">dog.jpg</span>
      </div>

      {/* synthetic cursor (dog drag only) */}
      <svg className="cursor" ref={cursorRef} viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">
        <path
          d="M3 1.5 L3 20.5 L8.2 15.3 L11.4 21.6 L14.3 20.1 L11.1 13.9 L18.5 13.9 Z"
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
