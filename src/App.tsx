import { useEffect, useRef, useState } from "react";
import { initialTheme, persist, swapTheme, type Theme } from "./theme";
import Wash from "./Wash";

/**
 * Wall-label layout. One narrow text column parked off-centre, with the objects
 * in the wide column beside it. Each object is position:sticky inside its own
 * project row, so it holds while you read that project and releases at the next
 * one. No scroll listener and no intersection observer: the browser does it.
 */

type Work = {
  name: string;
  href: string;
  spec: string;
  body: string;
  more?: { label: string; href: string };
  /** the object in the right column, and what it is */
  media: { stem: string; alt: string };
};

const WORK: Work[] = [
  {
    name: "Typer",
    href: "https://github.com/frgmt0/typer",
    spec: "Swift · MIT · alpha",
    body: "On-device autocomplete for macOS. A faint suggestion appears at your caret in almost any text field and streams in word by word. It runs against a small local model through llama.cpp, so there is no cloud, no account, and nothing leaves the Mac.",
    more: { label: "typr.frgmt.xyz", href: "https://typr.frgmt.xyz" },
    media: {
      stem: "screen",
      alt: "A folded plaster screen of five narrow panels, one drifted open.",
    },
  },
  {
    name: "Beckett",
    href: "https://github.com/kowo-co/beckett",
    spec: "TypeScript · MIT · Kowo",
    body: "A Discord-native AI engineer. You mention it, it judges how much effort the request deserves, and for real work it opens a numbered task and hands the branches to a pool of coding agents running in isolated worktrees. One agent does the talking. The rest do the building.",
    media: {
      stem: "fleet",
      alt: "One tall plaster slab standing in front of a receding row of five smaller ones.",
    },
  },
  {
    name: "Jingle",
    href: "https://github.com/kowo-co/jingle-jingle",
    spec: "Rust · Apache 2.0 · Kowo",
    body: "A password manager for AI agents that never shows the agent a password. Secrets leave through four doors: a child process, the clipboard for thirty seconds, a TOTP code, or a print you ask for by name. Everything else comes back redacted, and each audit line carries the hash of the one before it.",
    media: {
      stem: "vault",
      alt: "A solid plaster block with four narrow slots cut through its face.",
    },
  },
];

/**
 * The floor plan in the left gutter. Ids match the sections it points at.
 *
 * Work is a room label rather than a link: it is the heading over the three
 * objects listed beneath it, and it is never somewhere you are standing, since
 * standing in Work means standing at one of the three.
 */
const RAIL = [
  { id: "now", label: "Now" },
  { id: "work", label: "Work", head: true },
  { id: "typer", label: "Typer", sub: true },
  { id: "beckett", label: "Beckett", sub: true },
  { id: "jingle", label: "Jingle", sub: true },
  { id: "experience", label: "Experience" },
  { id: "elsewhere", label: "Elsewhere" },
] as const;

/**
 * Which section is being read. The rail is a floor plan, so it should mark the
 * room you are standing in rather than the one nearest the top of the window.
 * The band is the middle of the viewport; the last entry to cross it wins.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio);
        let best = ids[0];
        let top = -1;
        for (const id of ids) {
          const r = seen.get(id) ?? 0;
          if (r > top) {
            top = r;
            best = id;
          }
        }
        if (top > 0) setActive(best);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return active;
}

/** Motion is opt-in. Under reduce, the objects are still photographs. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export default function App() {
  const reduced = useReducedMotion();
  const [theme, setTheme] = useState<Theme>("light");
  /** objects sit out the wipe, then come back */
  const [settling, setSettling] = useState(false);
  /** the arrival animation only exists as a response to a switch */
  const [swapped, setSwapped] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // the Work label is a heading, not a place, so it is not in the running
  const active = useActiveSection(RAIL.filter((r) => !("head" in r)).map((r) => r.id));

  useEffect(() => {
    const t = initialTheme();
    setTheme(t);
    persist(t);
  }, []);

  const onToggle = async () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const box = toggleRef.current?.getBoundingClientRect();
    const origin = box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: window.innerWidth, y: 0 };

    // Hiding the objects has to happen in the same synchronous render as the
    // theme change, so the wipe's snapshot of the new page has them already
    // absent. Setting it beforehand would not be flushed in time.
    await swapTheme(
      next,
      origin,
      (t) => {
        setTheme(t);
        setSwapped(true);
        setSettling(true);
      },
      reduced,
    );
    setSettling(false);
  };

  return (
    <div
      className="page"
      data-settling={settling ? "" : undefined}
      data-swapped={swapped ? "" : undefined}
    >
      <Wash theme={theme} reduced={reduced} />

      <a className="skip" href="#main">
        Skip to content
      </a>

      <span className="mark">frgmt</span>

      <nav className="rail" aria-label="Sections">
        <ul>
          {RAIL.map((r) => (
            <li key={r.id} className={"sub" in r ? "sub" : undefined}>
              {"head" in r ? (
                <span className="room">{r.label}</span>
              ) : (
                <a
                  href={`#${r.id}`}
                  aria-current={active === r.id ? "true" : undefined}
                  data-on={active === r.id ? "" : undefined}
                >
                  {r.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <button
        ref={toggleRef}
        className="lamp"
        onClick={onToggle}
        aria-pressed={theme === "dark"}
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
      >
        {theme === "dark" ? "light" : "dark"}
      </button>

      <main id="main" className="col">
        <h1 className="line">
          Jason Weiss Zeledon builds small tools that sit between people and language models.
        </h1>

        <section id="now">
          <h2 className="key">Now</h2>
          <p>
            Founder of <a href="https://kowo.frgmt.xyz">Kowo</a>, currently stealth. Claude
            Ambassador for Students and Educators. Based in Los Angeles.
          </p>
        </section>
      </main>

      <section className="works" aria-label="Work" id="work">
        <h2 className="key col-slot">Work</h2>
        {WORK.map((w, i) => (
          <article className="work" key={w.name} id={w.name.toLowerCase()}>
            <div className="work-text">
              <h3>
                <a href={w.href}>{w.name}</a> <span className="spec">{w.spec}</span>
              </h3>
              <p>{w.body}</p>
              {w.more && (
                <p className="more">
                  <a href={w.more.href}>{w.more.label}</a>
                </p>
              )}
            </div>
            <figure className="work-media">
              {/*
                Keyed on the theme so React swaps the element rather than the
                attribute. A fresh node restarts the CSS animation, which is what
                makes each object arrive instead of blinking.
              */}
              <img
                key={`${w.media.stem}-${theme}`}
                className="object"
                style={{ ["--i" as string]: i }}
                src={`/media/${w.media.stem}${theme === "dark" ? "-dark" : ""}.webp`}
                alt={w.media.alt}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </figure>
          </article>
        ))}
      </section>

      <div className="col tail">
        <section id="experience">
          <h2 className="key">Experience</h2>
          <dl className="cv">
            <div>
              <dt>2026</dt>
              <dd>Founder, Kowo. Stealth.</dd>
            </div>
            <div>
              <dt>2022&ndash;2023</dt>
              <dd>Student Intern, CNUSD IT Department, under Myles Allen.</dd>
            </div>
          </dl>
        </section>

        <section id="elsewhere">
          <h2 className="key">Elsewhere</h2>
          <p>
            <a href="https://github.com/frgmt0">github.com/frgmt0</a>
            <br />
            <a href="https://kcodes.me">kcodes.me</a>
            <br />
            <a href="https://kowo.frgmt.xyz">kowo.frgmt.xyz</a>
          </p>
        </section>

        <p className="end">© 2026 Jason Weiss Zeledon</p>
      </div>
    </div>
  );
}
