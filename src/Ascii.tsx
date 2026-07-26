import { memo, useEffect, useRef } from "react";

/* ============================================================
   Ascii — a shader, but every pixel is a character.
   A Möbius band, swept as a real surface and lit by a moving key
   light. The band is one-sided, so the normal is flipped toward
   the camera before shading — which is exactly what makes the
   twist legible: the highlight runs off one edge and comes back
   along the other. Diffuse + a tight specular lobe are quantized
   into a glyph ramp (dark -> light), and that quantization *is*
   the dithering. The hottest cells are spanned in clay so the
   highlight rolls through in Claude's orange as it turns.
   Written to a <pre> each frame. No canvas, no WebGL — just text.
   ============================================================ */

const RAMP = " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const COLS = 78;
const ROWS = 40;

const R = 2.05; // radius of the band's centre circle
const W = 1.15; // half-width of the strip
const DU = 0.0125; // step around the band
const DV = 0.03; // step across it
/* Camera distance. Kept well clear of the band (~5x its reach):
   up close, perspective swings the projected size wildly as it
   turns, so any fit that never clips also leaves it tiny most of
   the time. Further back, the scale barely varies and the fit can
   be tight. */
const K2 = 16;

/** the band's surface point. u goes once around, v runs across the
 *  strip; the half-twist is the u/2 in the frame. A slight 3-lobe
 *  swell in the width gives it the saddle silhouette. */
function surf(u: number, v: number): [number, number, number] {
  const h = u / 2;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const w = v * (1 + 0.16 * Math.cos(3 * u)); // lobed edge
  const r = R + w * c;
  return [r * Math.cos(u), r * Math.sin(u), w * s + 0.22 * Math.sin(3 * u)];
}

/* Projection scale. The band tumbles freely, so the only fit that
   can't clip is its bounding sphere: measure the furthest point
   once, then solve K1 so that radius maps inside the shorter axis
   (rows, since cells are 2:1 and we double x). */
const REACH = (() => {
  let m = 0;
  for (let u = 0; u < Math.PI * 2; u += 0.02) {
    for (let v = -W; v <= W; v += 0.05) {
      const [x, y, z] = surf(u, v);
      m = Math.max(m, Math.hypot(x, y, z));
    }
  }
  return m;
})();
/* Fit both axes against the nearest possible z (K2 - REACH), where
   perspective magnifies most. x is doubled to square up 2:1 cells,
   so the horizontal budget is halved. Whichever axis binds, wins. */
const K1 = Math.min(
  ((K2 - REACH) * (ROWS / 2 - 0.5)) / REACH,
  ((K2 - REACH) * (COLS / 2 - 0.5)) / (REACH * 2.0)
);

// html-escape; the frame is written via innerHTML so hot cells can
// carry a span. (Only ever our own glyphs — see RAMP.)
const esc = (ch: string) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch);

function renderFrame(A: number, B: number): string {
  const n = COLS * ROWS;
  const out = new Uint8Array(n); // ramp index per cell
  const hot = new Uint8Array(n); // 1 -> render in clay
  const zbuf = new Float32Array(n);

  const cosA = Math.cos(A);
  const sinA = Math.sin(A);
  const cosB = Math.cos(B);
  const sinB = Math.sin(B);

  // key light, orbiting slightly out of phase with the tumble
  const lx = Math.cos(A * 0.7) * 0.62;
  const ly = 0.6;
  const lz = -0.55 + Math.sin(A * 0.5) * 0.3;
  const ll = Math.hypot(lx, ly, lz) || 1;

  const TAU = Math.PI * 2;
  const E = 0.004; // finite-difference step for the tangents

  for (let u = 0; u < TAU; u += DU) {
    /* everything trigonometric depends only on u, so hoist it: the
       surface is linear in v, which makes the inner loop pure
       arithmetic. This is what keeps the whole sweep in budget. */
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const h = u / 2;
    const ch = Math.cos(h);
    const sh = Math.sin(h);
    const lobe = 1 + 0.16 * Math.cos(3 * u); // width modulation
    const rise = 0.22 * Math.sin(3 * u); // out-of-plane swell
    // the v-tangent is constant along the strip
    const t2x = ch * lobe * cu * E;
    const t2y = ch * lobe * su * E;
    const t2z = sh * lobe * E;

    for (let v = -W; v <= W; v += DV) {
      const w = v * lobe;
      const r = R + w * ch;
      const px = r * cu;
      const py = r * su;
      const pz = w * sh + rise;

      const [ux, uy, uz] = surf(u + E, v);
      const t1x = ux - px;
      const t1y = uy - py;
      const t1z = uz - pz;

      // tangents -> surface normal
      let snx = t1y * t2z - t1z * t2y;
      let sny = t1z * t2x - t1x * t2z;
      let snz = t1x * t2y - t1y * t2x;
      const sl = Math.hypot(snx, sny, snz) || 1;
      snx /= sl;
      sny /= sl;
      snz /= sl;

      // tumble: rotate about X by A, then about Y by B
      const y1 = py * cosA - pz * sinA;
      const z1 = py * sinA + pz * cosA;
      const x2 = px * cosB + z1 * sinB;
      const z2 = -px * sinB + z1 * cosB;

      const ny1 = sny * cosA - snz * sinA;
      const nz1 = sny * sinA + snz * cosA;
      let nx2 = snx * cosB + nz1 * sinB;
      let ny2 = ny1;
      let nz2 = -snx * sinB + nz1 * cosB;

      const z = z2 + K2;
      if (z <= 0.1) continue;
      const ooz = 1 / z;

      const xp = (COLS / 2 + K1 * ooz * x2 * 2.0) | 0; // *2 -> square up 2:1 cells
      const yp = (ROWS / 2 - K1 * ooz * y1) | 0;
      if (xp < 0 || xp >= COLS || yp < 0 || yp >= ROWS) continue;

      const idx = xp + yp * COLS;
      if (ooz <= zbuf[idx]) continue;

      // the band has no inside: face the normal toward the camera
      if (nz2 > 0) {
        nx2 = -nx2;
        ny2 = -ny2;
        nz2 = -nz2;
      }

      const diff = (nx2 * lx + ny2 * ly + nz2 * lz) / ll;
      zbuf[idx] = ooz;
      if (diff <= 0) {
        out[idx] = 0;
        hot[idx] = 0;
        continue;
      }
      // lifted floor + gamma so the dark side still shows structure
      const spec = Math.pow(diff, 14);
      const lum = Math.min(1, 0.2 + Math.pow(diff, 0.72) * 0.72 + spec * 0.7);
      out[idx] = Math.min(RAMP.length - 1, (lum * (RAMP.length - 1)) | 0);
      hot[idx] = spec > 0.3 ? 1 : 0;
    }
  }

  // serialise, wrapping runs of hot cells in a single span
  let s = "";
  for (let r = 0; r < ROWS; r++) {
    let open = false;
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const wantHot = hot[i] === 1 && out[i] > 0;
      if (wantHot !== open) {
        s += wantHot ? '<b class="hot">' : "</b>";
        open = wantHot;
      }
      s += esc(RAMP[out[i]]);
    }
    if (open) s += "</b>";
    s += "\n";
  }
  return s;
}

export default memo(function Ascii() {
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const pre = ref.current;
    if (!pre) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let A = 0.55;
    let B = 0.2;

    if (reduced) {
      pre.innerHTML = renderFrame(A, B);
      return;
    }

    let raf = 0;
    let frameToggle = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      frameToggle ^= 1;
      if (frameToggle) return; // ~30fps, plenty for ascii
      A += 0.009;
      B += 0.005;
      pre.innerHTML = renderFrame(A, B);
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
  }, []);

  return <pre className="ascii" ref={ref} aria-hidden="true" />;
});
