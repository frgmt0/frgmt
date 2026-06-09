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
// nearby particles get pulled out of the surface into spikes.
//
// Shaded as liquid metal: surface normals come from the field gradient,
// then a fake environment does the rest — sky reflection from above,
// fresnel brightening at grazing edges, a hard key-light specular, and
// a gleam that tracks the cursor. Rendered into a low-res buffer and
// upscaled with smoothing for soft edges.
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
    let field: Float32Array | null = null;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    let mx = -1e4;
    let my = -1e4;
    let parts: P[] = [];
    let cx = 0;
    let cy = 0;

    const seed = () => {
      cx = w * 0.5;
      cy = h * 0.4;
      const base = Math.min(w, h) * 0.12;
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
      if (!buffer || !field) return;

      // pass 1: scalar field
      let fi = 0;
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
          field[fi++] = f;
        }
      }

      // pass 2: chrome shading from field gradient
      const data = buffer.data;
      const gleamR = Math.min(w, h) * 0.6;
      // key light, upper-left, normalized
      const lx = -0.45;
      const ly = -0.6;
      const lz = 0.66;
      const GS = 1.5; // gradient → normal strength
      let idx = 0;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++, idx += 4) {
          const i = y * bw + x;
          const f = field[i];
          if (f <= 0.9) {
            data[idx + 3] = 0;
            continue;
          }
          const xm = field[x > 0 ? i - 1 : i];
          const xp = field[x < bw - 1 ? i + 1 : i];
          const ym = field[y > 0 ? i - bw : i];
          const yp = field[y < bh - 1 ? i + bw : i];
          let nx = (xm - xp) * GS;
          let ny = (ym - yp) * GS;
          let nz = 0.35;
          const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx *= inv;
          ny *= inv;
          nz *= inv;

          // key-light specular, ~n·l^18 via squaring
          let s = nx * lx + ny * ly + nz * lz;
          if (s < 0) s = 0;
          const s2 = s * s;
          const s4 = s2 * s2;
          const s8 = s4 * s4;
          const spec = s8 * s8 * s2;

          // cursor gleam, tighter lobe with distance falloff
          const pxs = (x + 0.5) * SCALE;
          const pys = (y + 0.5) * SCALE;
          const gxd = mx - pxs;
          const gyd = my - pys;
          const gd = Math.sqrt(gxd * gxd + gyd * gyd) + 1e-3;
          const gz = 170;
          const gi = 1 / Math.sqrt(gd * gd + gz * gz);
          let gs = nx * gxd * gi + ny * gyd * gi + nz * gz * gi;
          if (gs < 0) gs = 0;
          const g2 = gs * gs;
          const g4 = g2 * g2;
          const g8 = g4 * g4;
          const gspec = g8 * g8 * g8 * Math.max(0, 1 - gd / gleamR);

          // environment: sky from above + fresnel at grazing edges
          const sky = 0.3 + 0.42 * Math.max(0, -ny) + 0.07 * nx;
          const fres = (1 - nz) * (1 - nz);
          const base = 14 + sky * 132 + fres * 128;
          const sp = spec * 225 + gspec * 255;

          // cool mercury cast, faint ember pickup in the fresnel rim
          let r = base * 0.94 + fres * 24 + sp;
          let g = base * 0.97 + fres * 8 + sp;
          let b = base * 1.06 + sp * 1.04;
          if (r > 255) r = 255;
          if (g > 255) g = 255;
          if (b > 255) b = 255;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = f < 1 ? ((f - 0.9) * 2550) | 0 : 255;
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
      field = new Float32Array(bw * bh);
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
