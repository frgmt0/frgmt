import { useEffect, useRef } from "react";
import type { Theme } from "./theme";

/**
 * The wash behind the page: an ASCII truchet field.
 *
 * Truchet tiles are square tiles carrying a diagonal, laid so the diagonals of
 * neighbouring tiles meet. Drawn as slashes on a character grid they form long
 * continuous runs that read as one drifting line rather than as noise. A slow
 * fbm field decides how bright each cell is and, above a threshold, flips its
 * diagonal, so the pattern is always reorganising without anything ever moving
 * across the screen. It is the same idea as the WebGL grain gradient, in
 * characters, at a fraction of the weight and with no dependency.
 *
 * Readability comes from the palette rather than from a mask. The brightest
 * value the field can put behind body text is lighter than the hairlines that
 * are already on the page, so the wash can cover the whole site without ever
 * competing with a word.
 */

const PALETTE = {
  light: {
    /* blue-gray for the field, the bone of the objects for the peaks */
    cool: [148, 163, 184],
    bone: [186, 172, 140],
    alpha: 0.5,
  },
  dark: {
    cool: [96, 118, 145],
    bone: [140, 122, 84],
    alpha: 0.4,
  },
} as const;

const CELL = 14;
/* one frame every 60ms. The field drifts; it does not animate. */
const FRAME_MS = 60;

/** Deterministic hash, so a cell keeps its character between frames. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Value noise: hashed lattice with a smoothstep between corners. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Three octaves is enough to get soft basins without the field looking woven. */
function fbm(x: number, y: number): number {
  return noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
}

export default function Wash({ theme, reduced }: { theme: Theme; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const p = PALETTE[theme];
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      ctx.font = `${CELL - 1}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "top";
    };

    /*
      Cells are collected into four bands and drawn a band at a time. Setting
      fillStyle per cell would mean six thousand state changes a frame; per band
      it is four.
    */
    const bands: string[][][] = [[], [], [], []];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const band of bands) band.length = 0;

      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const n = fbm(cx * 0.062 + t * 0.06, cy * 0.062 - t * 0.035);
          if (n < 0.4) continue;

          // remap to 0..1 across the visible part of the field
          const b = Math.min(1, (n - 0.4) / 0.34);
          const band = b < 0.14 ? 0 : b < 0.55 ? 1 : b < 0.96 ? 2 : 3;

          /*
            The truchet: which way the diagonal runs. Orientation is hashed per
            cell, and the field is folded into the hash so tiles flip as it
            drifts past them. Density is what makes it read as truchet rather
            than as noise, so every cell above the floor carries a diagonal; the
            fringe gets a dot, and only the rare peak gets both diagonals.
          */
          const slash = hash(cx, cy) + n * 0.7 > 0.78 ? "/" : "\\";
          const ch = band === 0 ? "." : band === 3 ? "X" : slash;
          bands[band].push([ch, String(cx * CELL), String(cy * CELL)]);
        }
      }

      for (let i = 0; i < 4; i++) {
        const cells = bands[i];
        if (!cells.length) continue;
        // the peaks pick up the bone; everything below stays blue-gray
        const mix = i === 3 ? 0.85 : i === 2 ? 0.3 : 0;
        const c = [0, 1, 2].map((k) =>
          Math.round(p.cool[k] * (1 - mix) + p.bone[k] * mix),
        );
        ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${[0.28, 0.62, 0.9, 0.85][i]})`;
        for (const [ch, x, y] of cells) ctx.fillText(ch, Number(x), Number(y));
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now / 1000);
    };

    const onResize = () => {
      resize();
      draw(reduced ? 0 : performance.now() / 1000);
    };

    resize();

    if (reduced) {
      // a still field: the pattern is the point, the drift is the flourish
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    // a shader nobody is looking at is a shader nobody should be paying for
    const onVisibility = () => {
      if (reduced) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, reduced]);

  return (
    <canvas
      ref={ref}
      className="wash"
      aria-hidden="true"
      style={{ opacity: PALETTE[theme].alpha }}
    />
  );
}
