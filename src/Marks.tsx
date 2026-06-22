import { memo, useEffect, useRef } from "react";

/* ============================================================
   Marks — a sparse field of drifting brutalist glyphs (+ × — ·)
   that sit far behind the page. They parallax with the pointer and
   scroll, brighten when the cursor passes, and occasionally flare
   red. Quiet on purpose: the blob is the loud shader; this is the
   atmosphere around it.
   ============================================================ */

type Glyph = "plus" | "cross" | "dash" | "dot";

type Mark = {
  x: number;
  y: number;
  z: number; // depth 0..1 -> size, speed, parallax, brightness
  s: number; // size px
  vy: number;
  sway: number;
  phase: number;
  rot: number;
  spin: number;
  kind: Glyph;
  ember: boolean;
};

const KINDS: Glyph[] = ["plus", "cross", "dash", "dot", "plus", "dash"];

export default memo(function Marks() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;
    let marks: Mark[] = [];
    let pmx = -1e4;
    let pmy = -1e4;

    const seed = () => {
      const n = Math.min(80, Math.max(28, Math.floor((w * h) / 24000)));
      marks = Array.from({ length: n }, () => {
        const z = 0.15 + Math.random() ** 1.7 * 0.85;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          s: (5 + z * 11) * (0.7 + Math.random() * 0.8),
          vy: (0.03 + Math.random() * 0.08) * z,
          sway: 5 + Math.random() * 16,
          phase: Math.random() * Math.PI * 2,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.003,
          kind: KINDS[(Math.random() * KINDS.length) | 0],
          ember: Math.random() < 0.08,
        };
      });
    };

    const glyph = (m: Mark, x: number, y: number, alpha: number) => {
      const r = m.s / 2;
      ctx.save();
      ctx.translate(x, y);
      if (m.kind === "dot") {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.7, r * 0.16), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.rotate(m.rot);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      if (m.kind === "plus") {
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
      } else if (m.kind === "cross") {
        const d = r * 0.72;
        ctx.moveTo(-d, -d);
        ctx.lineTo(d, d);
        ctx.moveTo(d, -d);
        ctx.lineTo(-d, d);
      } else {
        // dash
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
      }
      ctx.stroke();
      ctx.restore();
    };

    const draw = (once = false) => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      const sy = window.scrollY;
      const cx = pmx > -1e3 ? pmx / w - 0.5 : 0;
      const cy = pmy > -1e3 ? pmy / h - 0.5 : 0;
      const wrap = h + 90;

      for (const m of marks) {
        if (!once) {
          m.y += m.vy;
          m.rot += m.spin;
        }
        const px = m.x + Math.sin(t * 0.004 + m.phase) * m.sway - cx * 40 * m.z;
        let py = m.y - cy * 22 * m.z - sy * 0.12 * m.z;
        py = (((py % wrap) + wrap) % wrap) - 45;

        const dx = px - pmx;
        const dy = py - pmy;
        const d2 = dx * dx + dy * dy;
        let near = 0;
        if (d2 < 26000) near = 1 - Math.sqrt(d2) / 161;

        const flicker = 0.5 + 0.5 * Math.sin(t * 0.005 + m.phase) ** 2;
        const base = (m.ember ? 0.34 : 0.16) * m.z * flicker + near * 0.4;
        const lw = 0.7 + m.z * 0.8;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        if (m.ember || near > 0.4) {
          ctx.strokeStyle = `rgba(229,57,70,${base.toFixed(3)})`;
          ctx.fillStyle = `rgba(229,57,70,${base.toFixed(3)})`;
        } else {
          ctx.strokeStyle = `rgba(234,215,226,${(base * 0.7).toFixed(3)})`;
          ctx.fillStyle = `rgba(234,215,226,${(base * 0.7).toFixed(3)})`;
        }
        glyph(m, px, py, 1);
      }
      ctx.globalAlpha = 1;
      if (!once) raf = requestAnimationFrame(() => draw());
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduced) draw(true);
    };

    const onPointer = (e: PointerEvent) => {
      pmx = e.clientX;
      pmy = e.clientY;
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(() => draw());
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduced) {
      return () => window.removeEventListener("resize", resize);
    }
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(() => draw());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="field" aria-hidden="true" />;
});
