import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   Goose — the desktop-goose bit.
   A goose waddles in, drags a real pug photo onto the page, drops
   it, and goes back for another. Click a pug and it's gone — and
   the goose takes it personally: it drops what it's doing, storms
   over to your cursor, honks in your face, and only then goes
   back to work. Each time you do it, it gets angrier.

   Two rules keep it from being annoying:
     · it walks at a constant speed, so it never zooms — long
       trips just take longer;
     · it stays on-screen, hugging whichever edge is nearest,
       instead of teleporting across to re-enter.

   All motion is transform-only on one rAF loop. Respects
   prefers-reduced-motion. Pointer-events are off everywhere
   except the pugs, so none of it blocks the actual page.
   ============================================================ */

type Meme = { id: number; url: string; x: number; y: number; rot: number };

const MAX_MEMES = 6;
const MOODS = ["", "hmph", "hey", "HEY!", "HONK", "HONK!!", "H O N K"] as const;

const WALK = 105; // px/sec — a waddle, and it stays a waddle
const CHARGE = 230; // px/sec when it's coming for you

let uid = 0;

export default function Goose() {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [anger, setAnger] = useState(0);
  const [shout, setShout] = useState("");
  const [flip, setFlip] = useState(false);
  const [mad, setMad] = useState(false);

  const gooseRef = useRef<HTMLDivElement | null>(null);
  const carriedRef = useRef<HTMLDivElement | null>(null);
  const angerRef = useRef(0);
  angerRef.current = anger;

  /** where you last swatted a meme — the goose drops everything to
   *  come yell at this spot. Consumed by the director. */
  const grudgeRef = useRef<{ x: number; y: number } | null>(null);
  const interruptRef = useRef(false);

  const fetchPug = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch("https://dog.ceo/api/breed/pug/images/random");
      const d = await r.json();
      return d?.status === "success" && d.message ? (d.message as string) : null;
    } catch {
      return null;
    }
  }, []);

  const pop = (id: number, ev: React.MouseEvent) => {
    setMemes((m) => m.filter((x) => x.id !== id));
    // remember where the crime happened, and cut the current walk short
    grudgeRef.current = { x: ev.clientX, y: ev.clientY };
    interruptRef.current = true;
    setAnger((a) => Math.min(MOODS.length - 1, a + 1));
  };

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goose = gooseRef.current;
    const carried = carriedRef.current;
    if (!goose || !carried) return;

    // reduced motion: a couple of memes appear, the goose stays put
    if (reduced) {
      (async () => {
        const urls = await Promise.all([fetchPug(), fetchPug()]);
        setMemes(
          urls.filter(Boolean).map((url, i) => ({
            id: uid++,
            url: url as string,
            x: 64 + i * 9,
            y: 26 + i * 32,
            rot: i ? 3 : -4,
          }))
        );
      })();
      return;
    }

    let alive = true;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        timers.push(setTimeout(res, ms));
      });

    let gx = -90;
    let gy = window.innerHeight * 0.62;
    const place = (x: number, y: number) => {
      gx = x;
      gy = y;
      goose.style.transform = `translate(${x}px, ${y}px)`;
    };
    place(gx, gy);

    /** Walk at a constant speed. Resolves early (true) if you swat a
     *  meme mid-stride, so the goose can react immediately. */
    const walkTo = (tx: number, ty: number, speed = WALK) =>
      new Promise<boolean>((res) => {
        const sx = gx;
        const sy = gy;
        const dist = Math.hypot(tx - sx, ty - sy);
        const ms = Math.max(220, (dist / speed) * 1000);
        const t0 = performance.now();
        setFlip(tx < sx);
        const paint = (now: number) => {
          if (!alive) return res(false);
          if (interruptRef.current) return res(true);
          const p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          // gait: a fixed ~2.4 steps/sec bob, not a function of speed
          const bob = Math.sin(((now - t0) / 1000) * Math.PI * 2.4) * 4.5;
          place(sx + (tx - sx) * e, sy + (ty - sy) * e + bob);
          if (p < 1) raf = requestAnimationFrame(paint);
          else res(false);
        };
        raf = requestAnimationFrame(paint);
      });

    const bounds = () => ({ W: window.innerWidth, H: window.innerHeight });

    /** it comes for you. */
    const confront = async () => {
      const spot = grudgeRef.current;
      grudgeRef.current = null;
      interruptRef.current = false;
      if (!spot) return;

      // whatever it was carrying gets dropped in the panic
      carried.style.opacity = "0";
      setMad(true);

      const { W, H } = bounds();
      // stand just beside the cursor, never on top of it
      const tx = Math.max(10, Math.min(W - 84, spot.x + (spot.x > W / 2 ? -96 : 40)));
      const ty = Math.max(10, Math.min(H - 82, spot.y - 30));
      await walkTo(tx, ty, CHARGE);
      if (!alive) return;

      // honk, right in your face
      setShout(MOODS[Math.min(MOODS.length - 1, angerRef.current)] || "hmph");
      await sleep(1000);
      if (!alive) return;
      setShout("");
      setMad(false);
      await sleep(300);
    };

    /** one round trip: fetch a pug, fetch it from the nearest edge,
     *  carry it somewhere, drop it. */
    const trip = async () => {
      const url = await fetchPug();
      if (!alive || !url) return;
      const { W, H } = bounds();

      // fetch from whichever edge it's already closest to — no
      // sprinting across the whole page to re-enter
      const nearLeft = gx < W / 2;
      const edgeX = nearLeft ? -80 : W + 10;
      if (await walkTo(edgeX, H * (0.5 + Math.random() * 0.32))) return;
      if (!alive) return;

      carried.style.backgroundImage = `url(${url})`;
      carried.style.opacity = "1";
      await sleep(800); // get a grip on it
      if (!alive || interruptRef.current) return;

      // drop it on the right-hand side, clear of the reading column
      const dropX = W * (0.52 + Math.random() * 0.34);
      const dropY = H * (0.14 + Math.random() * 0.6);
      if (await walkTo(dropX, dropY)) return;
      if (!alive) return;

      carried.style.opacity = "0";
      setMemes((m) =>
        [
          ...m,
          {
            id: uid++,
            url,
            x: (dropX / W) * 100,
            y: (dropY / H) * 100,
            rot: -7 + Math.random() * 14,
          },
        ].slice(-MAX_MEMES)
      );

      await sleep(900); // admire the placement
      if (!alive || interruptRef.current) return;

      // wander a little way off, staying on-screen
      await walkTo(
        Math.max(20, Math.min(W - 90, dropX + (Math.random() < 0.5 ? -260 : 260))),
        Math.min(H - 90, dropY + 90)
      );
    };

    (async () => {
      await sleep(1400);
      while (alive) {
        // a walk can be cut short without a grudge to answer for it
        // (e.g. the click landed as a trip was ending) — never let a
        // stale flag park the goose forever
        if (interruptRef.current && !grudgeRef.current) interruptRef.current = false;

        if (grudgeRef.current) {
          await confront();
        } else {
          await trip();
          if (!alive) return;
          // it always takes a breather, however cross it is
          if (!grudgeRef.current) await sleep(Math.max(2400, 4600 - angerRef.current * 380));
        }
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
    };
  }, [fetchPug]);

  return (
    <div className="goose-layer" aria-hidden="true">
      {memes.map((m) => (
        <button
          type="button"
          className="meme"
          key={m.id}
          onClick={(e) => pop(m.id, e)}
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            transform: `translate(-50%, -50%) rotate(${m.rot}deg)`,
          }}
          aria-label="dismiss"
          tabIndex={-1}
        >
          <img src={m.url} alt="" draggable={false} />
          <span className="meme-cap">dog.jpg</span>
        </button>
      ))}

      <div
        className="goose"
        ref={gooseRef}
        data-flip={flip ? "1" : undefined}
        data-mad={mad ? "1" : undefined}
      >
        <div className="goose-carry" ref={carriedRef} />
        {shout && <span className="goose-shout">{shout}</span>}
        {/* a goose, in profile, drawn as flat shapes: long neck
            arced forward, body tapering to a lifted tail */}
        <svg viewBox="0 0 74 72" width="74" height="72">
          <g className="goose-body">
            <path d="M62 40 L72 33 L69 44 Z" fill="var(--paper)" />
            <ellipse cx="42" cy="46" rx="21" ry="13" fill="var(--paper)" />
            {/* the long neck: up from the breast, arcing forward */}
            <path
              d="M27 46 Q18 40 17 24 Q16 10 24 7 Q32 4 33 12 Q34 19 27 25 Q24 33 30 43 Z"
              fill="var(--paper)"
            />
            <ellipse cx="26" cy="10" rx="7" ry="6" fill="var(--paper)" />
            <circle cx="23" cy="8.4" r="1.5" fill="var(--ink)" />
            <path d="M19.5 9 L10 11.5 L19.5 14 Z" fill="#e8a33d" />
            <path d="M32 42 Q44 34 58 42 Q46 51 34 47 Z" fill="var(--paper-dim)" opacity="0.45" />
            <path
              d="M38 58 L36 68 M48 58 L50 68"
              stroke="#e8a33d"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M32 68 L40 68 M46 68 L54 68"
              stroke="#e8a33d"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
