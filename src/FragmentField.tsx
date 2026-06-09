import { memo, useEffect, useRef } from "react";

type Shard = {
  x: number;
  y: number;
  z: number; // depth 0..1 — drives size, speed, parallax, brightness
  len: number;
  a: number;
  spin: number;
  vy: number;
  sway: number;
  phase: number;
  ember: boolean;
};

export default memo(function FragmentField() {
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
    let shards: Shard[] = [];
    // park the pointer far off-canvas until it actually moves
    let pmx = -1e4;
    let pmy = -1e4;

    const seed = () => {
      const n = Math.min(110, Math.max(36, Math.floor((w * h) / 16000)));
      shards = Array.from({ length: n }, () => {
        const z = 0.15 + Math.random() ** 1.6 * 0.85;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          len: 4 + z * 16 * (0.6 + Math.random() * 0.9),
          a: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.004,
          vy: (0.04 + Math.random() * 0.1) * z,
          sway: 6 + Math.random() * 18,
          phase: Math.random() * Math.PI * 2,
          ember: Math.random() < 0.09,
        };
      });
    };

    const draw = (once = false) => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      const sy = window.scrollY;
      const cx = pmx > -1e3 ? pmx / w - 0.5 : 0;
      const cy = pmy > -1e3 ? pmy / h - 0.5 : 0;
      const wrap = h + 80;

      for (const s of shards) {
        if (!once) {
          s.y += s.vy;
          s.a += s.spin;
        }
        const px = s.x + Math.sin(t * 0.004 + s.phase) * s.sway - cx * 46 * s.z;
        let py = s.y - cy * 26 * s.z - sy * 0.16 * s.z;
        py = ((py % wrap) + wrap) % wrap - 40;

        // nudge + brighten shards near the cursor
        const dx = px - pmx;
        const dy = py - pmy;
        const d2 = dx * dx + dy * dy;
        let ox = 0;
        let oy = 0;
        let near = 0;
        if (d2 < 22500) {
          const d = Math.sqrt(d2) + 0.01;
          near = 1 - d / 150;
          ox = (dx / d) * near * 14;
          oy = (dy / d) * near * 8;
        }

        const flicker = 0.45 + 0.55 * Math.sin(t * 0.006 + s.phase) ** 2;
        const alpha = (s.ember ? 0.5 : 0.3) * s.z * flicker + near * 0.35;
        ctx.strokeStyle = s.ember
          ? `rgba(212,122,72,${alpha.toFixed(3)})`
          : `rgba(228,221,205,${(alpha * 0.55).toFixed(3)})`;
        ctx.lineWidth = 0.6 + s.z * 0.9;
        const hc = (Math.cos(s.a) * s.len) / 2;
        const hs = (Math.sin(s.a) * s.len) / 2;
        ctx.beginPath();
        ctx.moveTo(px + ox - hc, py + oy - hs);
        ctx.lineTo(px + ox + hc, py + oy + hs);
        ctx.stroke();
      }
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
