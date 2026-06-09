import { memo, useEffect, useRef } from "react";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // metaball radius (px)
  a: number; // rest angle around the anchor
  rest: number; // rest distance from the anchor
  wob: number; // wobble phase
  zw: number; // z-wobble phase
};

const N = 13;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Raymarched liquid chrome: the spring/magnet particle sim feeds metaball
// centers into an SDF (smooth-min spheres). Surface normals reflect a
// procedural "studio" environment — banded light pools are what give
// liquid metal its swirls — plus fresnel, a thin-film iridescent fringe
// at grazing angles, a key-light ping, and a gleam that follows the cursor.
const FRAG = `
precision highp float;
#define N ${N}
uniform vec2 uRes;
uniform vec2 uHalf;
uniform vec3 uB[N];
uniform float uR[N];
uniform vec2 uMouse;
uniform float uTime;

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < N; i++) {
    float di = length(p - uB[i]) - uR[i];
    float h = clamp(0.5 + 0.5 * (d - di) / 0.34, 0.0, 1.0);
    d = mix(d, di, h) - 0.34 * h * (1.0 - h);
  }
  return d;
}

vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.005, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

vec3 env(vec3 r) {
  float v = r.y;
  float a = atan(r.x, r.z);
  // vertical studio gradient: dark floor, silver sky
  vec3 col = mix(vec3(0.012, 0.012, 0.018), vec3(0.6, 0.62, 0.68), smoothstep(-0.6, 0.7, v));
  // bright overhead pool
  col += vec3(0.55) * smoothstep(0.5, 0.95, v);
  // swirling light bands — the signature of liquid chrome
  float band1 = smoothstep(0.45, 0.9, sin(v * 6.5 + a * 2.0));
  float band2 = smoothstep(0.55, 0.95, sin(v * 11.0 - a * 3.0 + 1.7));
  col += band1 * vec3(0.5, 0.51, 0.56) + band2 * vec3(0.28);
  // dark slashes for contrast
  col *= 0.7 + 0.3 * sin(v * 4.0 + a - 0.8);
  return col;
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

  if (hit < 0.0) {
    // thin silver fringe just past the silhouette, doubles as edge AA
    float aa = smoothstep(0.014, 0.0, dmin) * 0.3;
    gl_FragColor = vec4(vec3(0.75, 0.77, 0.82) * aa, aa);
    return;
  }

  vec3 p = ro + rd * hit;
  vec3 n = getNormal(p);
  vec3 r = reflect(rd, n);
  vec3 col = env(r);

  float ndv = max(dot(n, -rd), 0.0);
  float fr = pow(1.0 - ndv, 3.0);

  // face-on surfaces read dark (mercury reflects the dark room),
  // tilted surfaces catch the sky — this is what gives the swirl contrast
  col *= 0.4 + 0.6 * pow(1.0 - ndv, 0.55);

  // thin-film iridescence at grazing angles
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (fr * 1.6 + vec3(0.0, 0.33, 0.66)));
  col += irid * fr * 0.4;
  col = mix(col, col * 1.3, fr);

  // key light ping, upper-left front
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  col += vec3(1.0) * pow(max(dot(r, L), 0.0), 48.0) * 1.3;

  // cursor gleam
  vec3 Lm = normalize(vec3(uMouse - p.xy, 0.8));
  col += vec3(1.0, 0.94, 0.9) * pow(max(dot(n, Lm), 0.0), 36.0) * 0.7;

  // exposure + tonemap + gamma
  col *= 1.5;
  col = col / (col + 0.8);
  col = pow(col, vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
`;

export default memo(function Ferrofluid() {
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
    if (!gl) return; // no WebGL — the hero just stays atmospheric
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // --- GL setup ---
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

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
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
    };

    // --- simulation state ---
    let w = 0;
    let h = 0;
    let S = 1; // px → scene-unit divisor
    let raf = 0;
    let t = 0;
    let mx = -1e4;
    let my = -1e4;
    let parts: P[] = [];
    let cx = 0;
    let cy = 0;
    const ballData = new Float32Array(N * 3);
    const radiusData = new Float32Array(N);

    const seed = () => {
      cx = w * 0.5;
      cy = h * 0.4;
      const base = Math.min(w, h) * 0.13;
      parts = Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
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
          zw: Math.random() * Math.PI * 2,
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
        const wob = 1 + 0.16 * Math.sin(t * 0.013 + p.wob);
        const txp = acx + Math.cos(p.a + t * 0.0022) * p.rest * wob;
        const typ = acy + Math.sin(p.a + t * 0.0022) * p.rest * wob;
        p.vx += (txp - p.x) * 0.012;
        p.vy += (typ - p.y) * 0.012;

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
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        ballData[i * 3] = (p.x - w / 2) / S;
        ballData[i * 3 + 1] = -(p.y - h / 2) / S;
        ballData[i * 3 + 2] = 0.2 * Math.sin(t * 0.012 + p.zw);
        radiusData[i] = p.r / S;
      }
      gl.uniform3fv(loc.balls, ballData);
      gl.uniform1fv(loc.radii, radiusData);
      gl.uniform2f(loc.mouse, (mx - w / 2) / S, -(my - h / 2) / S);
      gl.uniform1f(loc.time, t * 0.016);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const rect = canvas.getBoundingClientRect();
      if (rect.bottom < 0) return; // hero scrolled away
      step();
      render();
    };

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      S = Math.min(w, h) * 0.3;
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform2f(loc.half, w / (2 * S), h / (2 * S));
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
