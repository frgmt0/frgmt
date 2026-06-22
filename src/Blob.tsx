import { memo, useEffect, useRef } from "react";

/* ============================================================
   Blob — a raymarched metaball lump, shaded as a flat halftone.
   The spring/magnet particle sim (pointer = magnet) feeds metaball
   centers into a smooth-min SDF; the surface is lit cheaply and then
   crushed through an 8x8 Bayer ordered-dither into the poster palette
   (ink -> pink -> paper, red where the cursor catches it). No reflections,
   no gradients — just chunky dots, like a screenprint that breathes.
   ============================================================ */

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  rest: number;
  wob: number;
  zw: number;
};

const N = 13;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
#define N ${N}
uniform vec2 uRes;
uniform vec2 uHalf;
uniform vec3 uB[N];
uniform float uR[N];
uniform vec2 uMouse;
uniform float uTime;
uniform float uPx;     // dither cell size, device px
uniform float uBuild;  // 0..1 boot reveal

// compact ordered-dither (Bayer 8x8 without an array lookup)
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// surface-tension ripples so the skin never reads as perfectly smooth
float ripple(vec3 p) {
  float n = sin(p.x * 9.0 + uTime * 0.7) * sin(p.y * 8.0 - uTime * 0.9) * sin(p.z * 7.0 + uTime * 0.5);
  n += 0.55 * sin(p.x * 17.0 - uTime * 1.3) * sin(p.y * 15.0 + uTime * 1.1);
  n += 0.3 * sin((p.x + p.y) * 26.0 + uTime * 1.9);
  return n;
}

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < N; i++) {
    float di = length(p - uB[i]) - uR[i];
    float h = clamp(0.5 + 0.5 * (d - di) / 0.42, 0.0, 1.0);
    d = mix(d, di, h) - 0.42 * h * (1.0 - h);
  }
  return d + ripple(p) * 0.016;
}

vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.005, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * uHalf;
  vec3 ro = vec3(uv, 3.0);
  vec3 rd = vec3(0.0, 0.0, -1.0);

  float t = 0.0;
  float dmin = 1e5;
  float hit = -1.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    dmin = min(dmin, d);
    if (d < 0.0015) { hit = t; break; }
    t += max(d * 0.9, 0.004);
    if (t > 6.0) break;
  }

  vec2 cell = gl_FragCoord.xy / uPx;
  float thr = bayer8(cell);

  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 p = ro + rd * hit;
  vec3 n = getNormal(p);

  float ndv = max(dot(n, -rd), 0.0);
  float fr = pow(1.0 - ndv, 2.4);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.65));
  float dif = max(dot(n, L), 0.0);
  float lum = 0.16 + 0.66 * dif + 0.4 * fr;

  // cursor key light — the spikes flare red as they reach the pointer
  vec3 Lm = normalize(vec3(uMouse - p.xy, 0.8));
  float spec = pow(max(dot(n, Lm), 0.0), 28.0);
  lum += spec * 0.7;
  lum = clamp(lum * uBuild, 0.0, 1.0);

  vec3 paper = vec3(0.949, 0.949, 0.949);
  vec3 pink  = vec3(0.918, 0.843, 0.886);
  vec3 dark  = vec3(0.07, 0.07, 0.085);
  vec3 red   = vec3(0.898, 0.224, 0.275);

  // two ordered thresholds give three tonal bands without banding
  float qHi = step(thr, (lum - 0.5) * 2.0);   // paper vs pink
  float qLo = step(thr, lum * 2.0);           // pink vs dark
  vec3 col = mix(pink, paper, qHi);
  col = mix(dark, col, qLo);
  // hot rim near the cursor punches through to red
  col = mix(col, red, step(thr, spec * 1.3) * step(0.25, spec));

  // silhouette stays crisp; one-cell dithered AA on the very edge
  float edge = smoothstep(0.010, 0.0, dmin);
  float a = max(step(thr, 0.6) * (1.0 - edge), edge);
  gl_FragColor = vec4(col, a);
}
`;

export default memo(function Blob() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = {
      res: gl.getUniformLocation(prog, "uRes"),
      half: gl.getUniformLocation(prog, "uHalf"),
      balls: gl.getUniformLocation(prog, "uB[0]"),
      radii: gl.getUniformLocation(prog, "uR[0]"),
      mouse: gl.getUniformLocation(prog, "uMouse"),
      time: gl.getUniformLocation(prog, "uTime"),
      px: gl.getUniformLocation(prog, "uPx"),
      build: gl.getUniformLocation(prog, "uBuild"),
    };

    let w = 0;
    let h = 0;
    let S = 1;
    let dpr = 1;
    let raf = 0;
    let t = 0;
    let build = reduced ? 1 : 0;
    let mx = -1e4;
    let my = -1e4;
    let pvx = 0;
    let pvy = 0;
    let parts: P[] = [];
    let cx = 0;
    let cy = 0;
    const ballData = new Float32Array(N * 3);
    const radiusData = new Float32Array(N);

    const seed = () => {
      cx = w * 0.5;
      cy = h * 0.52;
      const base = Math.min(w, h) * 0.125;
      parts = Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        const rest = base * (0.3 + Math.random() * 1.0);
        return {
          x: cx + Math.cos(a) * rest,
          y: cy + Math.sin(a) * rest,
          vx: 0,
          vy: 0,
          r: base * (0.38 + Math.random() * 0.52),
          a,
          rest,
          wob: Math.random() * Math.PI * 2,
          zw: Math.random() * Math.PI * 2,
        };
      });
    };

    const step = () => {
      t += 1;
      if (build < 1) build = Math.min(1, build + 0.012);
      const m = Math.min(w, h);
      const drift = m * 0.05;
      let acx = cx + Math.sin(t * 0.005) * drift + Math.sin(t * 0.0023 + 2.1) * drift * 0.7;
      let acy = cy + Math.cos(t * 0.0037) * drift * 0.8 + Math.cos(t * 0.0019) * drift * 0.5;
      const R = m * 0.75;

      const adx = mx - acx;
      const ady = my - acy;
      const ad = Math.hypot(adx, ady);
      if (ad < R && ad > 1) {
        const lean = (1 - ad / R) * m * 0.1;
        acx += (adx / ad) * lean;
        acy += (ady / ad) * lean;
      }

      for (const p of parts) {
        const wob = 1 + 0.34 * Math.sin(t * 0.013 + p.wob);
        const txp = acx + Math.cos(p.a + t * 0.0032) * p.rest * wob;
        const typ = acy + Math.sin(p.a + t * 0.0032) * p.rest * wob;
        p.vx += (txp - p.x) * 0.007;
        p.vy += (typ - p.y) * 0.007;

        const dx = mx - p.x;
        const dy = my - p.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1) {
          const pull = (1 - d / R) ** 1.6 * 2.6;
          p.vx += (dx / d) * pull;
          p.vy += (dy / d) * pull;
          p.vx += pvx * (1 - d / R) * 0.18;
          p.vy += pvy * (1 - d / R) * 0.18;
        }

        p.vx *= 0.93;
        p.vy *= 0.93;
        p.x += p.vx;
        p.y += p.vy;
      }

      for (let i = 0; i < N; i++) {
        const a = parts[i];
        for (let j = i + 1; j < N; j++) {
          const b = parts[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = (a.r + b.r) * 0.66;
          const d = Math.hypot(dx, dy);
          if (d < min && d > 0.1) {
            const f = ((min - d) / min) * 0.5;
            const ux = (dx / d) * f;
            const uy = (dy / d) * f;
            a.vx -= ux;
            a.vy -= uy;
            b.vx += ux;
            b.vy += uy;
          }
        }
      }

      pvx *= 0.8;
      pvy *= 0.8;
    };

    const render = () => {
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        ballData[i * 3] = (p.x - w / 2) / S;
        ballData[i * 3 + 1] = -(p.y - h / 2) / S;
        ballData[i * 3 + 2] = 0.34 * Math.sin(t * 0.014 + p.zw);
        radiusData[i] = p.r / S;
      }
      gl.uniform3fv(loc.balls, ballData);
      gl.uniform1fv(loc.radii, radiusData);
      gl.uniform2f(loc.mouse, (mx - w / 2) / S, -(my - h / 2) / S);
      gl.uniform1f(loc.time, t * 0.016);
      gl.uniform1f(loc.build, build);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const rect = canvas.getBoundingClientRect();
      if (rect.bottom < 0) return;
      step();
      render();
    };

    const resize = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      S = Math.min(w, h) * 0.3;
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform2f(loc.half, w / (2 * S), h / (2 * S));
      gl.uniform1f(loc.px, Math.max(2, Math.round(2.6 * dpr)));
      seed();
      if (reduced) render();
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (mx > -1e3) {
        pvx = Math.max(-40, Math.min(40, pvx + (nx - mx) * 0.5));
        pvy = Math.max(-40, Math.min(40, pvy + (ny - my) * 0.5));
      }
      mx = nx;
      my = ny;
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

  return <canvas ref={ref} className="blob" aria-hidden="true" />;
});
