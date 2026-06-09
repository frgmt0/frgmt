import { memo, useEffect, useRef } from "react";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // metaball radius
  a: number; // rest angle around the anchor
  rest: number; // rest distance from the anchor
  wob: number; // wobble phase
};

// Metaball ferrofluid: a ring of spring-anchored particles whose summed
// field is thresholded into one gooey mass. The pointer is the magnet —
// nearby particles get pulled out of the surface into spikes. Rendered
// into a low-res field buffer, upscaled with smoothing for soft edges.
export default memo(function Ferrofluid() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const SCALE = 6; // field buffer is 1/6 resolution
    let w = 0;
    let h = 0;
    let bw = 0;
    let bh = 0;
    let raf = 0;
    let t = 0;
    let buffer: ImageData | null = null;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    let mx = -1e4;
    let my = -1e4;
    let parts: P[] = [];
    let cx = 0;
    let cy = 0;

    const seed = () => {
      cx = w * 0.6;
      cy = h * 0.42;
      const base = Math.min(w, h) * 0.115;
      const n = 13;
      parts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const rest = base * (0.55 + Math.random() * 0.5);
        return {
          x: cx + Math.cos(a) * rest,
          y: cy + Math.sin(a) * rest,
          vx: 0,
          vy: 0,
          r: base * (0.5 + Math.random() * 0.35),
          a,
          rest,
          wob: Math.random() * Math.PI * 2,
        };
      });
    };

    const step = () => {
      t += 1;
      const drift = Math.min(w, h) * 0.022;
      const acx = cx + Math.sin(t * 0.005) * drift;
      const acy = cy + Math.cos(t * 0.0037) * drift * 0.7;
      const R = Math.min(w, h) * 0.45;

      for (const p of parts) {
        // breathing rest shape, slowly rotating
        const wob = 1 + 0.16 * Math.sin(t * 0.013 + p.wob);
        const txp = acx + Math.cos(p.a + t * 0.0022) * p.rest * wob;
        const typ = acy + Math.sin(p.a + t * 0.0022) * p.rest * wob;
        p.vx += (txp - p.x) * 0.012;
        p.vy += (typ - p.y) * 0.012;

        // the magnet — closest particles spike hardest
        const dx = mx - p.x;
        const dy = my - p.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1) {
          const pull = (1 - d / R) ** 2 * 1.15;
          p.vx += (dx / d) * pull;
          p.vy += (dy / d) * pull;
        }

        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;
      }
    };

    const render = () => {
      if (!buffer) return;
      const data = buffer.data;
      const rimR = Math.min(w, h) * 0.55;
      let idx = 0;
      for (let y = 0; y < bh; y++) {
        const py = (y + 0.5) * SCALE;
        for (let x = 0; x < bw; x++) {
          const px = (x + 0.5) * SCALE;
          let f = 0;
          for (const p of parts) {
            const dx = px - p.x;
            const dy = py - p.y;
            f += (p.r * p.r) / (dx * dx + dy * dy + 1);
          }
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (f > 1) {
            // ink fill, a hair darker than the page
            r = 8;
            g = 7;
            b = 6;
            a = 255;
          } else if (f > 0.74) {
            // ember rim light, brighter on the magnetized side
            let k = (f - 0.74) / 0.26;
            k *= k;
            const dmx = px - mx;
            const dmy = py - my;
            const dm = Math.hypot(dmx, dmy);
            const facing = Math.max(0.18, 1 - dm / rimR);
            r = 212;
            g = 122;
            b = 72;
            a = Math.min(255, Math.floor(k * facing * 235));
          }
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
          idx += 4;
        }
      }
      offCtx.putImageData(buffer, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, bw, bh, 0, 0, w, h);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      // hero scrolled out of view — keep physics idle-cheap, skip pixels
      const rect = canvas.getBoundingClientRect();
      if (rect.bottom < 0) return;
      step();
      render();
    };

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w;
      canvas.height = h;
      bw = Math.max(2, Math.ceil(w / SCALE));
      bh = Math.max(2, Math.ceil(h / SCALE));
      off.width = bw;
      off.height = bh;
      buffer = offCtx.createImageData(bw, bh);
      seed();
      if (reduced) render();
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduced) {
      return () => window.removeEventListener("resize", resize);
    }
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="ferro" aria-hidden="true" />;
});
