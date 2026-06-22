import { useEffect, useRef, useState } from "react";
import Blob from "./Blob";
import Typewriter, { type Op } from "./Typewriter";

/* ============================================================
   frgmt.xyz — the site builds itself, on tape.
   It opens blank. A cursor drags the blob in, types the wordmark,
   drops in the one project worth showing (typer), wires the links,
   and stops. SKIP cuts to the finished frame. One locked viewport,
   no scroll.
   ============================================================ */

type Project = {
  name: string;
  desc: string;
  language: string;
  stars: number;
  url: string;
  updated: string;
};

// real snapshot of github.com/frgmt0/typer — refreshed live on load
const TYPER: Project = {
  name: "typer",
  desc: "Local, on-device autocomplete for macOS — inline AI completions via llama.cpp, no cloud.",
  language: "Swift",
  stars: 3,
  url: "https://github.com/frgmt0/typer",
  updated: "2026-06-21",
};

const wordScript: Op[] = [
  { op: "type", text: "frg" },
  { op: "type", text: "tm" }, // transposed
  { op: "pause", ms: 380 },
  { op: "selBack", n: 2 },
  { op: "pause", ms: 130 },
  { op: "type", text: "mt" }, // fixed -> frgmt
];

const nameScript: Op[] = [{ op: "type", text: "typer", cps: 17 }];

type Built = {
  frame: boolean;
  blob: boolean;
  word: boolean;
  typer: boolean;
  links: boolean;
};

const ALL_BUILT: Built = { frame: true, blob: true, word: true, typer: true, links: true };
const NONE_BUILT: Built = { frame: false, blob: false, word: false, typer: false, links: false };

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

export default function App() {
  const [proj, setProj] = useState<Project>(TYPER);
  const [built, setBuilt] = useState<Built>(NONE_BUILT);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<SVGSVGElement | null>(null);
  const blobBoxRef = useRef<HTMLDivElement | null>(null);
  const wordRef = useRef<HTMLHeadingElement | null>(null);
  const projRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<HTMLElement | null>(null);

  const wordDoneRef = useRef<(() => void) | null>(null);
  const nameDoneRef = useRef<(() => void) | null>(null);
  const directorRef = useRef<{ cancel: () => void } | null>(null);

  // refresh typer from github (keeps stars/desc/date honest)
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
        /* keep the snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalize = () => {
    setBuilt(ALL_BUILT);
    setSkipped(true);
    setDone(true);
    setLog(["init", "frame", "blob", "frgmt", "typer", "ready"]);
    const b = blobBoxRef.current;
    if (b) {
      b.style.transform = "";
      b.style.opacity = "1";
    }
    const c = cursorRef.current;
    if (c) c.style.opacity = "0";
  };

  // the director
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    if (reduced || coarse) {
      // no performance for touch / reduced-motion: show the finished frame
      finalize();
      return;
    }

    let alive = true;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const cur = cursorRef.current!;
    const blobBox = blobBoxRef.current!;
    let cx = -60;
    let cy = -60;

    const place = (x: number, y: number, press = false) => {
      cx = x;
      cy = y;
      cur.style.transform = `translate(${x - 2}px, ${y - 1}px)`;
      cur.dataset.press = press ? "1" : "";
    };
    place(cx, cy);

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        timers.push(setTimeout(res, ms));
      });

    const easeInOut = (p: number) =>
      p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    // Progression is timer-driven so the sequence completes even if the
    // tab is backgrounded (rAF pauses there). rAF only paints between ticks.
    const moveTo = (
      tx: number,
      ty: number,
      ms: number,
      onProgress?: (e: number, x: number, y: number) => void,
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
          onProgress?.(e, cx, cy);
          if (p < 1) raf = requestAnimationFrame(paint);
        };
        raf = requestAnimationFrame(paint);
        timers.push(
          setTimeout(() => {
            cancelAnimationFrame(raf);
            place(tx, ty, press);
            onProgress?.(1, tx, ty);
            res();
          }, ms)
        );
      });

    const center = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
    };

    const gate = (ref: React.MutableRefObject<(() => void) | null>, maxMs: number) =>
      Promise.race([
        new Promise<void>((res) => {
          ref.current = res;
        }),
        sleep(maxMs),
      ]);

    const addLog = (line: string) => setLog((l) => [...l, line]);

    directorRef.current = {
      cancel: () => {
        alive = false;
        cancelAnimationFrame(raf);
        for (const t of timers) clearTimeout(t);
      },
    };

    (async () => {
      const W = window.innerWidth;
      const H = window.innerHeight;

      await sleep(450);
      if (!alive) return;

      // 1 — frame
      addLog("init");
      setBuilt((b) => ({ ...b, frame: true }));
      await sleep(650);
      addLog("frame");

      // 2 — drag the blob in from the left
      const origin = { x: W * 0.14, y: H * 0.46 };
      const home = center(blobBox);
      await moveTo(origin.x, origin.y, 750);
      if (!alive) return;
      place(cx, cy, true); // grab
      blobBox.style.opacity = "1";
      await sleep(200);
      await moveTo(
        home.x,
        home.y,
        1500,
        (e, x, y) => {
          const tx = x - home.x;
          const ty = y - home.y;
          const s = 0.14 + 0.86 * e;
          blobBox.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
        },
        true
      );
      if (!alive) return;
      place(cx, cy, false); // release
      blobBox.style.transform = "";
      setBuilt((b) => ({ ...b, blob: true }));
      addLog("blob");
      await sleep(420);

      // 3 — type the wordmark
      const w = wordRef.current?.getBoundingClientRect();
      if (w) await moveTo(w.left + 36, w.top + w.height * 0.62, 720);
      if (!alive) return;
      place(cx, cy, true);
      await sleep(150);
      place(cx, cy, false);
      setBuilt((b) => ({ ...b, word: true }));
      await gate(wordDoneRef, 6000);
      if (!alive) return;
      addLog("frgmt");
      await sleep(320);

      // 4 — drop the project block in
      const p = projRef.current?.getBoundingClientRect();
      if (p) {
        await moveTo(p.left + 40, p.top + 26, 720);
        if (!alive) return;
        place(cx, cy, true);
        await sleep(160);
        place(cx, cy, false);
      }
      setBuilt((b) => ({ ...b, typer: true }));
      await gate(nameDoneRef, 5000);
      if (!alive) return;
      addLog("typer");
      await sleep(360);

      // 5 — wire the links, park
      const l = center(linksRef.current);
      await moveTo(l.x, l.y, 620);
      if (!alive) return;
      setBuilt((b) => ({ ...b, links: true }));
      await sleep(420);
      addLog("ready");
      // glide the cursor off and fade it
      await moveTo(window.innerWidth + 60, window.innerHeight * 0.9, 900);
      if (!alive) return;
      cur.style.opacity = "0";
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

  const showWord = built.word;
  const showName = built.typer;

  return (
    <div
      className="stage"
      ref={stageRef}
      data-done={done ? "1" : undefined}
      data-skipped={skipped ? "1" : undefined}
    >
      {/* layout guides + registration marks */}
      <div className={`guides${built.frame ? " in" : ""}`} aria-hidden="true">
        <span className="reg reg-tl" />
        <span className="reg reg-tr" />
        <span className="reg reg-bl" />
        <span className="reg reg-br" />
        <span className="guide guide-h" />
        <span className="guide guide-v" />
      </div>

      {/* the blob */}
      <div className={`blob-box${built.blob ? " in" : ""}`} ref={blobBoxRef} aria-hidden="true">
        <Blob />
      </div>

      {/* synthetic cursor */}
      <svg
        className="cursor"
        ref={cursorRef}
        viewBox="0 0 24 24"
        width="23"
        height="23"
        aria-hidden="true"
      >
        <path
          d="M3 1.5 L3 20.5 L8.2 15.3 L11.4 21.6 L14.3 20.1 L11.1 13.9 L18.5 13.9 Z"
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>

      {/* top bar */}
      <header className="bar">
        <span className="bar-brand">frgmt.xyz</span>
        {!done && (
          <button className="skip" onClick={skip} type="button">
            skip <span aria-hidden="true">→</span>
          </button>
        )}
      </header>

      {/* the work */}
      <main className="work">
        <h1 className="word" ref={wordRef} aria-label="frgmt">
          {skipped ? (
            <span className="word-static">frgmt</span>
          ) : showWord ? (
            <Typewriter
              script={wordScript}
              start
              caretAtRest={false}
              className="word-tw"
              ariaLabel="frgmt"
              onDone={() => wordDoneRef.current?.()}
            />
          ) : (
            <span className="word-static" style={{ visibility: "hidden" }}>
              frgmt
            </span>
          )}
        </h1>

        <p className={`word-sub${built.typer ? " in" : ""}`}>small, finishable software</p>

        <section className={`proj${built.typer ? " in" : ""}`} ref={projRef} aria-label={proj.name}>
          <div className="proj-head">
            <span className="proj-tag">now</span>
            <h2 className="proj-name">
              {skipped ? (
                <span>{proj.name}</span>
              ) : showName ? (
                <Typewriter
                  script={nameScript}
                  start
                  caretAtRest={false}
                  className="name-tw"
                  ariaLabel={proj.name}
                  onDone={() => nameDoneRef.current?.()}
                />
              ) : (
                <span style={{ visibility: "hidden" }}>{proj.name}</span>
              )}
            </h2>
            <span className="proj-meta">
              {proj.language} · ★{proj.stars} · {fmtDate(proj.updated)}
            </span>
          </div>
          <div className="proj-body">
            <p className="proj-desc">{proj.desc}</p>
            <a className="proj-link" href={proj.url}>
              → github.com/frgmt0/typer
            </a>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="foot">
        <div className="log" aria-hidden="true">
          {log.slice(-5).map((line, i, arr) => (
            <span key={`${line}-${i}`} data-last={i === arr.length - 1 ? "1" : undefined}>
              {line}
            </span>
          ))}
        </div>
        <nav className={`foot-links${built.links ? " in" : ""}`} ref={linksRef} aria-label="elsewhere">
          <a href="https://github.com/frgmt0">github</a>
          <a href="https://kcodes.me">kcodes.me</a>
          <span className="foot-coord">34.05°N 118.24°W</span>
        </nav>
      </footer>
    </div>
  );
}
