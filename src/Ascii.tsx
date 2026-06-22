import { memo, useEffect, useRef } from "react";

/* ============================================================
   Ascii — a shader, but every pixel is a character.
   A torus is swept in 3D, lit by a moving light, and the dot
   product at each point is quantized into a ramp of glyphs
   (dark -> light). That quantization *is* the dithering. Written
   to a <pre> each frame. No canvas, no WebGL — just text.
   ============================================================ */

const RAMP = ".,-~:;=!*#$@"; // 12 levels, dark -> light
const COLS = 46;
const ROWS = 24;

// torus + projection constants (classic donut math, retuned for
// 2:1 terminal cells so the ring reads round, not squished)
const R1 = 1;
const R2 = 2;
const K2 = 5;
const K1 = (COLS * K2 * 3) / (8 * (R1 + R2));

function renderFrame(A: number, B: number): string {
  const out = new Array<string>(COLS * ROWS).fill(" ");
  const zbuf = new Float32Array(COLS * ROWS);
  const cosA = Math.cos(A);
  const sinA = Math.sin(A);
  const cosB = Math.cos(B);
  const sinB = Math.sin(B);

  for (let theta = 0; theta < 6.283; theta += 0.07) {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    for (let phi = 0; phi < 6.283; phi += 0.02) {
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const circleX = R2 + R1 * ct;
      const circleY = R1 * st;

      const x = circleX * (cosB * cp + sinA * sinB * sp) - circleY * cosA * sinB;
      const y = circleX * (sinB * cp - sinA * cosB * sp) + circleY * cosA * cosB;
      const z = K2 + cosA * circleX * sp + circleY * sinA;
      const ooz = 1 / z;

      const xp = (COLS / 2 + K1 * ooz * x) | 0;
      const yp = (ROWS / 2 - K1 * ooz * y * 0.5) | 0; // *0.5 -> round in tall cells

      const lum =
        cp * ct * sinB -
        cosA * ct * sp -
        sinA * st +
        cosB * (cosA * st - ct * sinA * sp);

      if (yp >= 0 && yp < ROWS && xp >= 0 && xp < COLS) {
        const idx = xp + yp * COLS;
        if (ooz > zbuf[idx]) {
          zbuf[idx] = ooz;
          const li = (lum * 8) | 0;
          out[idx] = RAMP[li > 0 ? (li < 11 ? li : 11) : 0];
        }
      }
    }
  }

  let s = "";
  for (let r = 0; r < ROWS; r++) {
    s += out.slice(r * COLS, r * COLS + COLS).join("") + "\n";
  }
  return s;
}

export default memo(function Ascii({ run = true }: { run?: boolean }) {
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const pre = ref.current;
    if (!pre) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let A = 0.4;
    let B = 0.2;

    if (reduced || !run) {
      pre.textContent = renderFrame(A, B);
      return;
    }

    let raf = 0;
    let frameToggle = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      frameToggle ^= 1;
      if (frameToggle) return; // ~30fps, plenty for ascii
      A += 0.045;
      B += 0.022;
      pre.textContent = renderFrame(A, B);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [run]);

  return <pre className="ascii" ref={ref} aria-hidden="true" />;
});
