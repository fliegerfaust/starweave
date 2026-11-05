import { FxGuard, type FxLevel } from './fx-guard';

/**
 * Слой шейдеров для моментов удара (витрина IM.1). Прозрачный холст WebGL2 лежит над полем и
 * под интерфейсом, рисует только пока идёт эффект; в покое холст скрыт и телефон не нагружает.
 * Материал один на всё: глубокий космос (туманность и звёзды), собранный из текстуры шума.
 * Два характера различаются тем, что космос делает с картами: `nova` рассыпает их в звёздную
 * пыль, `hole` затягивает в чёрную дыру. Характер выбирается на каждый ход (`setLook`).
 */

export type FxLook = 'nova' | 'hole';

type Rgb = [number, number, number];

interface LookSpec {
  mode: number;
  /** Рампа света: глубина, тело, горячая часть; белое ядро общее. */
  ramp: [Rgb, Rgb, Rgb];
  /** Два цвета газа туманности. */
  gas: [Rgb, Rgb];
  /** Сколько цвета масти подмешать в тело света. */
  tint: number;
  amp: number;
  freq: number;
  speed: number;
  width: number;
  heat: number;
  /** Звёзды на нити бегут к голове с этой скоростью. */
  flow: number;
  fly: number;
  curl: number;
}

const hex = (s: string): Rgb => {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const LOOKS: Record<FxLook, LookSpec> = {
  nova: {
    mode: 0,
    ramp: [hex('#141a6e'), hex('#58b6ff'), hex('#f4ecff')],
    gas: [hex('#ff4f9e'), hex('#39d5ff')],
    tint: 0.25, amp: 7, freq: 0.012, speed: 1.4, width: 1.8, heat: 0.7, flow: 2.4, fly: 90, curl: 110,
  },
  hole: {
    mode: 1,
    ramp: [hex('#25105c'), hex('#8a63ff'), hex('#ffd9a8')],
    gas: [hex('#ff8a3d'), hex('#7a4dff')],
    tint: 0.15, amp: 10, freq: 0.01, speed: 1, width: 2.1, heat: 0.66, flow: -3.2, fly: 60, curl: 60,
  },
};

const VERT_QUAD = `#version 300 es
precision highp float;
uniform vec2 uRes, uCenter, uAxisX, uAxisY;
uniform vec3 uCam;
out vec2 vL;
void main() {
  vec2 a = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vL = a;
  vec2 p = uCenter + uAxisX * a.x + uAxisY * a.y;
  p = p * uCam.z + uCam.xy;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;

export const SHADER_COMMON = `#version 300 es
precision highp float;
uniform sampler2D uNoise;
uniform vec3 uC0, uC1, uC2, uN1, uN2;
uniform float uT, uSeed, uHeat, uPx;
uniform int uMode;
in vec2 vL;
out vec4 frag;
float nz(vec2 p) { return texture(uNoise, p).r; }
float nm(vec2 p) { return texture(uNoise, p).g; }
float nr(vec2 p) { return texture(uNoise, p).b; }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 ramp(float v) {
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.42, v));
  c = mix(c, uC2, smoothstep(0.42, 0.78, v));
  return mix(c, vec3(1.0), smoothstep(0.82, 1.05, v));
}
/* Звезда с лучами, как в телескопе: ядро и тонкий крест дифракции. */
float star4(vec2 p, float s) {
  float a = abs(p.x), b = abs(p.y);
  return exp(-dot(p, p) / (s * s * 0.5)) + exp(-a * b / (s * s * 0.1)) * exp(-(a + b) / (s * 2.6)) * 0.8;
}
/* Россыпь звёзд по ячейкам: у каждой своя яркость и мерцание. */
float stars(vec2 p) {
  vec2 g = floor(p), f = fract(p) - 0.5;
  float h = h21(g);
  vec2 o = (vec2(h21(g + 3.1), h21(g + 7.7)) - 0.5) * 0.7;
  float tw = 0.65 + 0.35 * sin(uT * (2.0 + h * 5.0) + h * 40.0);
  vec2 d = f - o;
  return step(0.66, h) * exp(-dot(d, d) * (90.0 + h * 240.0)) * tw;
}
/* Газ туманности: шум, искажённый шумом, в два цвета. */
vec3 nebula(vec2 p, out float dens) {
  vec2 q = vec2(nz(p + uT * 0.006), nz(p * 1.3 + vec2(0.37, 0.11) - uT * 0.005));
  float a = nz(p * 0.9 + q * 0.42);
  float b = nm(p * 1.6 - q * 0.3 + 0.2);
  dens = smoothstep(0.34, 0.8, a * 0.72 + b * 0.38);
  vec3 c = mix(uC0 * 1.5, uN1, smoothstep(0.3, 0.68, b));
  return mix(c, uN2, smoothstep(0.52, 0.82, a));
}
`;

/** Нить созвездия: тонкая световая струна, по ней бегут звёзды. */
const FRAG_THREAD = SHADER_COMMON + `
uniform float uHalf, uHalfW, uOff, uTotal, uHead, uFade, uPulse, uAmp, uFreq, uSpeed, uW, uFlow, uTaper;
void main() {
  float U = uOff + (vL.x * 0.5 + 0.5) * uHalf * 2.0;
  float v = vL.y * uHalfW;
  vec2 px = gl_FragCoord.xy / uPx;
  float y = (nz(vec2(U * 0.0016 - uT * 0.02, uSeed)) - 0.5) * uAmp * 2.0 + sin(U * uFreq - uT * uSpeed + uSeed * 6.0) * uAmp * 0.35;
  float d = abs(v - y);
  float head = smoothstep(uHead + 3.0, uHead - 40.0, U);
  float ends = smoothstep(0.0, uTaper, U) * smoothstep(uTotal, uTotal - uTaper, U);
  float side = smoothstep(uHalfW, uHalfW * 0.6, abs(v));
  float eat = smoothstep(uFade * 1.25 - 0.25, uFade * 1.25, nm(vec2(U * 0.0052, v * 0.012 + 0.4)));
  float m = head * eat * side * ends;
  float flow = nm(vec2(U * 0.0042 - uT * 0.12, v * 0.009 + uSeed));
  float width = uW * mix(0.35, 1.0, ends);
  float e = exp(-d * d / (width * width)) * (0.95 + 0.6 * flow) + exp(-d / (width * 5.0)) * 0.42;
  float bs = U * 0.03 - uT * uFlow;
  float ci = floor(bs);
  float h = h21(vec2(ci, uSeed * 13.0));
  vec2 q = vec2((fract(bs) - 0.5) / 0.03, v - y - (h - 0.5) * 24.0);
  float st = star4(q, 1.5 + h * 3.2) * step(0.22, h) * (0.55 + 0.45 * sin(uT * 8.0 + h * 30.0));
  e = (e * (1.0 + uPulse * 1.5) + st * 1.5) * m;
  float dens;
  vec3 gas = nebula(px * 0.0022 + uSeed, dens) * dens * exp(-abs(v - y) / 17.0) * 0.5 * m;
  /* Тёмная подложка: струна читается и на яркой карте, и на тёмном небе. */
  float under = exp(-d * d / (width * width * 16.0)) * 0.5 * m;
  frag = vec4(ramp(clamp(e * uHeat, 0.0, 1.1)) * min(e, 1.0) + gas, under);
}`;

/** Удар: сжатие и сверхновая или чёрная дыра с диском; малые — блик и кольцо. */
const FRAG_BURST = SHADER_COMMON + `
uniform float uAge, uPower, uKind;
void main() {
  vec2 p = vL;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float a = uAge;
  vec2 px = gl_FragCoord.xy / uPx;
  float edge = smoothstep(1.0, 0.82, r);
  if (uKind > 2.5) {
    float f = pow(1.0 - a, 1.6);
    float st = star4(p * 60.0, 3.0 + a * 4.0) * f;
    frag = vec4(ramp(0.9) * st * uPower * edge, 0.0);
    return;
  }
  if (uKind > 1.5) {
    float front = 0.9 * (1.0 - pow(1.0 - a, 2.6));
    float rag = (nm(vec2(ang * 0.5, uSeed)) - 0.5) * 0.08;
    float x = (r + rag - front) / (0.012 + a * 0.03);
    float ring = exp(-x * x) * pow(1.0 - a, 1.4);
    float dens;
    vec3 n = nebula(p * 0.3 + uSeed, dens);
    frag = vec4((n * 1.1 + ramp(0.7) * 0.8) * ring * uPower * edge, 0.0);
    return;
  }
  if (uMode == 1) {
    float grow = smoothstep(0.0, 0.14, a);
    float gone = 1.0 - smoothstep(0.78, 0.92, a);
    float rs = 0.17 * grow * gone;
    float sw = ang * 0.15915 + log(max(r, 0.02)) * 0.34 - uT * 0.16;
    float band = nz(vec2(sw * 2.0, r * 0.22 + uSeed)) * 0.65 + nm(vec2(sw * 4.0, r * 0.4 - uT * 0.06)) * 0.55;
    float reach = 0.74 * grow * mix(0.3, 1.0, gone);
    float disk = smoothstep(rs * 0.96, rs * 1.25, r) * smoothstep(reach, reach * 0.3, r) * pow(band, 2.6) * 1.05;
    float heatR = smoothstep(reach, rs, r);
    vec3 dc = mix(uN2, mix(uN1, vec3(1.0, 0.93, 0.8), smoothstep(0.72, 1.0, heatR)), smoothstep(0.1, 0.6, heatR));
    float photon = exp(-pow((r - rs * 1.13) / 0.0095, 2.0)) * grow * gone * 1.9;
    float black = smoothstep(rs * 1.08, rs * 0.92, r) * step(0.001, rs);
    float out1 = 0.0;
    if (a > 0.86) {
      float k = (a - 0.86) / 0.14;
      float x = (r - k * 0.9) / (0.018 + k * 0.05);
      out1 = exp(-x * x) * (1.0 - k) * 1.6 + exp(-r * r * 40.0) * (1.0 - k) * 1.6;
    }
    vec3 col = dc * disk * (1.0 - black) + vec3(1.0, 0.95, 0.86) * photon + ramp(0.86) * out1;
    frag = vec4(col * uPower * edge, (black + disk * 0.4 * (1.0 - black)) * edge);
    return;
  }
  float imp = 1.0 - smoothstep(0.0, 0.15, a);
  float xi = (r - 0.52 * imp) / 0.035;
  float inward = exp(-xi * xi) * imp * step(0.001, imp);
  float k = clamp((a - 0.13) / 0.87, 0.0, 1.0);
  float front = 0.92 * (1.0 - pow(1.0 - k, 2.3));
  float rag = (nm(vec2(ang * 0.48, r * 0.24 + uSeed)) - 0.5) * 0.42;
  float xs = (r + rag * 0.6 - front) / (0.08 + 0.24 * k);
  float shell = exp(-xs * xs);
  float dens;
  vec3 n = nebula(p * 0.34 + uSeed, dens);
  float inner = smoothstep(front, front * 0.1, r + rag) * 0.4;
  float gas = (shell * (0.3 + dens * 1.6) + inner * dens) * step(0.001, k) * pow(1.0 - k, 1.1);
  float core = exp(-r * r * (12.0 + k * 80.0)) * step(0.001, k) * (1.0 - k) * 1.5;
  float fade = pow(1.0 - k, 1.7) * step(0.001, k);
  float c = cos(0.62), s = sin(0.62);
  vec2 d = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  float spikes = (exp(-abs(p.y) * 130.0) * exp(-abs(p.x) * 2.0) + exp(-abs(p.x) * 150.0) * exp(-abs(p.y) * 3.0) * 0.8 + exp(-abs(d.y) * 190.0) * exp(-abs(d.x) * 4.5) * 0.45) * fade * 1.5;
  float glints = (stars(p * 15.0 + uSeed) * 2.4 + stars(p * 30.0) * 1.3) * gas;
  vec3 col = n * gas * 0.92 + ramp(clamp(core, 0.0, 1.05)) * min(core, 1.0) + vec3(0.95, 0.97, 1.0) * (spikes + glints) + ramp(0.9) * inward;
  frag = vec4(col * uPower * edge, min(gas * 0.32, 0.5) * edge);
}`;

/** Карта покидает поле: рассыпается в пыль или уходит в дыру. */
const FRAG_CARD = SHADER_COMMON + `
uniform sampler2D uCard;
uniform float uProg;
uniform vec2 uRectMin, uRectSize, uHole, uRes2;
void main() {
  if (uMode == 1) {
    vec2 px = uHole + (vL * uRes2);
    vec2 rel = px - uHole;
    float r = length(rel);
    float q = uProg;
    float rot = q * q * 7.0 / (0.25 + r / 170.0);
    float c = cos(-rot), s = sin(-rot);
    vec2 back = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c) / max(0.015, pow(1.0 - q, 1.7));
    vec2 uv = (uHole + back - uRectMin) / uRectSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { frag = vec4(0.0); return; }
    vec4 t = texture(uCard, uv);
    vec3 hot = mix(t.rgb, ramp(0.86) * t.a, smoothstep(0.3, 0.95, q));
    float a = t.a * (1.0 - smoothstep(0.82, 1.0, q));
    frag = vec4(hot * (1.0 - smoothstep(0.82, 1.0, q)), a);
    return;
  }
  vec2 uv = vL * 0.5 + 0.5;
  vec4 c = texture(uCard, uv);
  float delay = nz(uv * 0.5 + uSeed) * 0.55 + (1.0 - uv.y) * 0.12;
  float m = delay - uProg;
  float keep = smoothstep(-0.012, 0.012, m);
  float rim = exp(-abs(m) * 46.0) * c.a * 0.8;
  frag = vec4(c.rgb * keep + ramp(0.72) * rim * keep, c.a * keep);
}`;

/** Пыль из самой карты: у каждой частицы её цвет, отрывается там, где карта исчезает. */
const VERT_DUST = `#version 300 es
precision highp float;
uniform vec2 uRes, uGrid, uRectMin, uRectSize;
uniform vec3 uCam, uC2;
uniform sampler2D uNoise, uCard;
uniform float uProg, uSeed, uDpr, uFly, uRot;
out vec3 vC;
out float vA;
float h(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  vec2 g = vec2(mod(id, uGrid.x), floor(id / uGrid.x));
  vec2 uv = (g + 0.5) / uGrid;
  vec4 c = textureLod(uCard, uv, 0.0);
  float delay = textureLod(uNoise, uv * 0.5 + uSeed, 0.0).r * 0.55 + (1.0 - uv.y) * 0.12;
  float age = (uProg - delay) / 0.62;
  if (c.a < 0.35 || age <= 0.0 || age >= 1.0) { gl_Position = vec4(2.0); gl_PointSize = 0.0; vC = vec3(0.0); vA = 0.0; return; }
  vec2 q = (uv - 0.5) * uRectSize;
  float cr = cos(uRot), sr = sin(uRot);
  vec2 p = uRectMin + uRectSize * 0.5 + vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
  vec2 flow = textureLod(uNoise, p * 0.0021 + vec2(uSeed, age * 0.12), 0.0).rg - 0.5;
  float e = 1.0 - pow(1.0 - age, 2.0);
  p += flow * uFly * 2.4 * e;
  p += vec2((h(id) - 0.5) * 60.0, -30.0 - h(id + 1.0) * uFly) * e;
  p = p * uCam.z + uCam.xy;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  float big = h(id + 2.0);
  gl_PointSize = uDpr * (uRectSize.x / uGrid.x) * (1.5 + big * big * 3.2) * (1.0 - age * 0.45);
  vC = mix(c.rgb / max(c.a, 0.01), uC2, smoothstep(0.1, 0.8, age));
  vA = pow(1.0 - age, 1.3);
}`;

const FRAG_DUST = `#version 300 es
precision highp float;
in vec3 vC;
in float vA;
out vec4 frag;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float e = exp(-r * r * 5.0) * smoothstep(1.0, 0.7, r);
  frag = vec4(vC * e * vA * 1.2, 0.0);
}`;

export const VERT_FULL = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 a = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vUv = a;
  gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Текстура шума: плавный, мелкий и хребтовый слои, бесшовные по краям. */
export const FRAG_NOISE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
float hs(vec2 p, float s) {
  p = fract(p * vec2(0.1031, 0.103) + s);
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float vn(vec2 uv, float n, float s) {
  vec2 p = uv * n, i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, n), b = mod(i + 1.0, n);
  return mix(mix(hs(a, s), hs(vec2(b.x, a.y), s), f.x), mix(hs(vec2(a.x, b.y), s), hs(b, s), f.x), f.y);
}
float fbm(vec2 uv, float cells, int octaves, float s, bool ridge) {
  float sum = 0.0, amp = 1.0, total = 0.0, n = cells;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    float v = vn(uv, n, s + float(i) * 0.17);
    sum += (ridge ? 1.0 - abs(v * 2.0 - 1.0) : v) * amp;
    total += amp;
    amp *= 0.5;
    n *= 2.0;
  }
  return sum / total;
}
void main() {
  float r = fbm(vUv, 4.0, 4, 0.11, false);
  float g = fbm(vUv, 8.0, 5, 0.29, false);
  float b = fbm(vUv, 6.0, 4, 0.47, true);
  frag = vec4(clamp((r - 0.22) / 0.56, 0.0, 1.0), clamp((g - 0.22) / 0.56, 0.0, 1.0), clamp((b - 0.3) / 0.6, 0.0, 1.0), 1.0);
}`;

/** Мир затихает вокруг линии: тёмная завеса с рваным краем, окно вокруг карт. */
const FRAG_FOCUS = SHADER_COMMON + `
uniform vec4 uHoles[3];
uniform float uOpens[3];
uniform int uCount;
uniform vec2 uRes2;
uniform float uStr;
void main() {
  vec2 px = (vL * 0.5 + 0.5) * uRes2;
  float sd = 100000.0;
  for (int i = 0; i < 3; i++) {
    if (i >= uCount) break;
    vec2 q = abs(px - uHoles[i].xy) - uHoles[i].zw;
    sd = min(sd, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) + (1.0 - uOpens[i]) * 170.0);
  }
  float n = (nz(px * 0.0016 + uT * 0.012) - 0.5) * 56.0;
  float a = smoothstep(-6.0, 70.0, sd + n) * uStr;
  frag = vec4(uC0 * 0.06 * a, a);
}`;

/** Пространство гнётся по снимку поля: кольцо волны или закрутка вокруг дыры. */
const FRAG_WAVE = SHADER_COMMON + `
uniform sampler2D uSnap;
uniform vec2 uAt, uRes2;
uniform float uAge, uReach, uStrength;
void main() {
  vec2 px = (vL * 0.5 + 0.5) * uRes2;
  vec2 d = px - uAt;
  float r = length(d);
  if (uMode == 1) {
    float grow = smoothstep(0.0, 0.2, uAge) * (1.0 - smoothstep(0.7, 0.95, uAge));
    float f = exp(-r / (uReach * 0.2));
    float rot = f * 1.15 * grow * uStrength;
    float c = cos(rot), s = sin(rot);
    vec2 w = vec2(d.x * c - d.y * s, d.x * s + d.y * c) * (1.0 + f * 0.5 * grow);
    vec3 col = texture(uSnap, (uAt + w) / uRes2).rgb;
    float a = smoothstep(uReach * 0.62, uReach * 0.34, r) * grow;
    frag = vec4(col * a, a);
    return;
  }
  float front = uReach * (1.0 - pow(1.0 - uAge, 2.2));
  float wide = uReach * 0.11 * (1.0 + uAge);
  float x = (r - front) / wide;
  float ring = exp(-x * x);
  float rag = 0.7 + 0.6 * nz(vec2(atan(d.y, d.x) * 0.3, uSeed));
  float bend = ring * rag * uStrength * (1.0 - uAge) * 34.0;
  vec2 dir = d / max(r, 1.0);
  /* Каналы расходятся на изгибе, как свет в линзе. */
  vec3 c;
  c.r = texture(uSnap, (px - dir * bend * 1.16) / uRes2).r;
  c.g = texture(uSnap, (px - dir * bend) / uRes2).g;
  c.b = texture(uSnap, (px - dir * bend * 0.84) / uRes2).b;
  float a = smoothstep(0.03, 0.3, ring) * (1.0 - smoothstep(0.75, 1.0, uAge));
  frag = vec4(c * a, a);
}`;

const VERT_POINTS = `#version 300 es
precision highp float;
uniform vec2 uRes, uAt, uSpread;
uniform vec3 uCam;
uniform sampler2D uNoise;
uniform float uAge, uLife, uFly, uCurl, uSize, uSeed, uDpr;
out float vE;
out float vK;
float h(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  float start = h(id) * 0.3;
  float span = 0.55 + h(id + 1.0) * 0.45;
  float age = (uAge - start) / (span * (1.0 - start));
  if (age <= 0.0 || age >= 1.0) { gl_Position = vec4(2.0); gl_PointSize = 0.0; vE = 0.0; vK = 0.0; return; }
  float ang = h(id + 2.0) * 6.2832;
  float t = age * uLife;
  float sp = uFly * (0.25 + h(id + 3.0) * 0.95);
  vec2 o = uAt + (vec2(h(id + 4.0), h(id + 5.0)) * 2.0 - 1.0) * uSpread;
  vec2 p = o + vec2(cos(ang), sin(ang)) * sp * (1.0 - exp(-t * 2.6)) / 2.6;
  vec2 c = textureLod(uNoise, p * 0.0017 + vec2(uSeed, t * 0.05), 0.0).rg - 0.5;
  p += c * uCurl * t * 2.0;
  p = p * uCam.z + uCam.xy;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  float big = h(id + 6.0);
  gl_PointSize = uSize * uDpr * (0.6 + big * big * big * 3.0);
  vE = 1.0 - age;
  vK = h(id + 7.0);
}`;

const FRAG_POINTS = `#version 300 es
precision highp float;
uniform vec3 uC0, uC1, uC2;
uniform float uT;
in float vE;
in float vK;
out vec4 frag;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float a = abs(p.x), b = abs(p.y);
  float e = (exp(-dot(p, p) * 26.0) * 1.2 + exp(-a * b * 170.0) * exp(-(a + b) * 3.6) * 0.75) * smoothstep(1.0, 0.72, max(a, b));
  float tw = 0.6 + 0.4 * sin(uT * 12.0 + vK * 60.0);
  vec3 c = mix(uC1, uC2, smoothstep(0.1, 0.7, vE * (0.5 + vK * 0.7)));
  frag = vec4(c * e * tw * min(1.0, vE * 2.6), 0.0);
}`;

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; rot?: number };

/** Что случилось со слоем: для настроек и статистики. */
export type FxState = 'ready' | 'failed' | 'lost' | 'lite' | 'off';

/** KHR_parallel_shader_compile: можно спросить о готовности, не останавливая поток. */
const COMPLETION_STATUS = 0x91b1;
/** Без расширения сборка блокирует поток: ждём, пока игрок ещё в меню. */
const BLOCKING_DELAY_MS = 1500;

interface Effect {
  /** Рисует кадр; false — эффект закончился. */
  draw(now: number): boolean;
}

export interface FocusFx {
  /** Открыть окно ещё одной линии. */
  add(rect: Rect): void;
  /** Вернуть свет миру. */
  release(duration: number): void;
}

export interface ThreadFx {
  /** Вспышка при замыкании линии. */
  pulse(): void;
  /** Нить тает и исчезает. */
  fade(duration: number): void;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  gl: WebGLProgram;
  u: Uniforms;
}

export class GlFx {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  /** Характер текущего хода; эффект запоминает его при создании и доживает в нём. */
  private spec: LookSpec;
  private prog!: Record<'thread' | 'burst' | 'card' | 'dust' | 'focus' | 'wave' | 'points' | 'noise', Program>;
  private noise: WebGLTexture | null = null;
  private readonly guard: FxGuard;
  private parallel = false;
  private readonly waiting = new Set<() => void>();
  private buildAt = 0;
  private pendingBuild = false;
  private ready = false;
  /** Игрок выключил эффекты в настройках. */
  enabled = true;
  /** Шейдер живёт и без эффектов (солнце Затмения): сторож считает кадры постоянно. */
  ambient = false;
  private readonly snapCanvas = document.createElement('canvas');
  private snapTex: WebGLTexture | null = null;
  private effects: Effect[] = [];
  private now = 0;
  private width = 0;
  private height = 0;
  private scale = 1;
  private cam: [number, number, number] = [0, 0, 1];
  private lost = false;
  private dirty = false;
  private dpr = 1;
  /** Центр главного удара: чёрная дыра затягивает карты именно туда. */
  private anchor: Pt = { x: 0, y: 0 };

  static create(host: HTMLElement, level: FxLevel, onState: (state: FxState, value: number) => void): GlFx | null {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-gl';
    canvas.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;visibility:hidden';
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    try {
      return new GlFx(host, canvas, gl, level, onState);
    } catch (e) {
      console.error('Слой шейдеров не собрался', e);
      return null;
    }
  }

  private constructor(host: HTMLElement, canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, level: FxLevel, private readonly onState: (state: FxState, value: number) => void) {
    this.canvas = canvas;
    this.gl = gl;
    this.spec = LOOKS.nova;
    this.guard = new FxGuard(level);
    host.append(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.ready = false;
      this.effects = [];
      // Ход ждёт, пока карты уйдут: без этого он завис бы навсегда
      for (const finish of this.waiting) finish();
      this.waiting.clear();
      canvas.style.visibility = 'hidden';
      this.onState('lost', 0);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.snapTex = null;
      this.build();
    });
    this.build();
  }

  /** Запускает сборку шейдеров и сразу возвращается: готовность проверяет `prepare`. */
  private build(): void {
    const { gl } = this;
    this.buildAt = performance.now();
    this.pendingBuild = true;
    // Расширения живут вместе с контекстом: после потери их надо просить заново
    this.parallel = gl.getExtension('KHR_parallel_shader_compile') !== null;
    const quad = this.shader(gl.VERTEX_SHADER, VERT_QUAD);
    this.prog = {
      thread: this.program(quad, FRAG_THREAD),
      burst: this.program(quad, FRAG_BURST),
      card: this.program(quad, FRAG_CARD),
      focus: this.program(quad, FRAG_FOCUS),
      wave: this.program(quad, FRAG_WAVE),
      dust: this.program(this.shader(gl.VERTEX_SHADER, VERT_DUST), FRAG_DUST),
      points: this.program(this.shader(gl.VERTEX_SHADER, VERT_POINTS), FRAG_POINTS),
      noise: this.program(this.shader(gl.VERTEX_SHADER, VERT_FULL), FRAG_NOISE),
    };
    gl.bindVertexArray(gl.createVertexArray());
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
  }

  /** Каждый кадр до готовности: не блокирует игру, пока драйвер собирает шейдеры. */
  private prepare(): void {
    const { gl } = this;
    const all = Object.values(this.prog);
    if (this.parallel) {
      if (!all.every((p) => gl.getProgramParameter(p.gl, COMPLETION_STATUS))) return;
    } else if (performance.now() - this.buildAt < BLOCKING_DELAY_MS) {
      // Без расширения проверка блокирует поток: откладываем её, пока игрок на экране меню
      return;
    }
    this.pendingBuild = false;
    try {
      for (const p of all) {
        if (!gl.getProgramParameter(p.gl, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p.gl) ?? 'программа не собралась');
        this.collect(p);
      }
      this.noise = this.makeNoise();
      this.warm();
      this.ready = true;
      this.onState('ready', Math.round(performance.now() - this.buildAt));
    } catch (e) {
      console.error('Слой шейдеров не собрался', e);
      this.lost = true;
      this.onState('failed', 0);
    }
  }

  private shader(type: number, src: string): WebGLShader {
    const { gl } = this;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  private program(vert: WebGLShader, frag: string): Program {
    const { gl } = this;
    const p = gl.createProgram()!;
    gl.attachShader(p, vert);
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    return { gl: p, u: {} };
  }

  private collect(p: Program): void {
    const { gl } = this;
    const n = gl.getProgramParameter(p.gl, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p.gl, i)!.name;
      p.u[name] = gl.getUniformLocation(p.gl, name);
    }
  }

  /** Текстуру шума рисует видеокарта: на процессоре это сотни миллисекунд на телефоне. */
  private makeNoise(): WebGLTexture {
    const { gl } = this;
    const size = 256;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog.noise.gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  /** Первая отрисовка каждой программы: драйвер доделывает её сейчас, а не в момент удара. */
  private warm(): void {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 1, 1);
    const spec = this.spec;
    for (const name of ['thread', 'burst', 'card', 'focus', 'wave'] as const) this.quad(this.use(this.prog[name], spec.ramp, spec), 0, 0, 1, 0, 0, 1);
    for (const name of ['dust', 'points'] as const) {
      this.use(this.prog[name], spec.ramp, spec);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Размер слоя; чёткость выше двойной на эффекте не видна, а телефону стоит дорого. */
  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.scale = this.guard.level > 0 ? 1 : Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.scale);
    this.canvas.height = Math.round(height * this.scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Можно ли начинать новый эффект. Уже начатые доигрываются сами. */
  get active(): boolean {
    return this.ready && this.enabled && !this.lost && this.guard.level < 2;
  }

  get level(): FxLevel {
    return this.guard.level;
  }

  /** Игрок снова включил эффекты: начинаем с полного качества. */
  reset(): void {
    this.guard.level = 0;
    this.resize(this.width, this.height, this.dpr);
  }

  /** Эффекты идут: нельзя пропускать кадры ради экономии. */
  get busy(): boolean {
    return this.effects.length > 0;
  }

  setLook(look: FxLook): void {
    this.spec = LOOKS[look];
  }

  private use(p: Program, ramp: [Rgb, Rgb, Rgb], spec: LookSpec): Uniforms {
    const { gl } = this;
    gl.useProgram(p.gl);
    const { u } = p;
    gl.uniform2f(u.uRes!, this.width, this.height);
    gl.uniform3f(u.uCam!, this.cam[0], this.cam[1], this.cam[2]);
    if (u.uC0) gl.uniform3fv(u.uC0, ramp[0]);
    if (u.uC1) gl.uniform3fv(u.uC1, ramp[1]);
    if (u.uC2) gl.uniform3fv(u.uC2, ramp[2]);
    if (u.uN1) gl.uniform3fv(u.uN1, spec.gas[0]);
    if (u.uN2) gl.uniform3fv(u.uN2, spec.gas[1]);
    if (u.uT) gl.uniform1f(u.uT, this.now);
    if (u.uHeat) gl.uniform1f(u.uHeat, spec.heat);
    if (u.uPx) gl.uniform1f(u.uPx, this.scale);
    if (u.uMode) gl.uniform1i(u.uMode, spec.mode);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    if (u.uNoise) gl.uniform1i(u.uNoise, 0);
    return u;
  }

  private quad(u: Uniforms, cx: number, cy: number, ax: number, ay: number, bx: number, by: number): void {
    const { gl } = this;
    gl.uniform2f(u.uCenter!, cx, cy);
    gl.uniform2f(u.uAxisX!, ax, ay);
    gl.uniform2f(u.uAxisY!, bx, by);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Рампа с цветом масти: у каждого характера своя доля. */
  private tinted(color: string): [Rgb, Rgb, Rgb] {
    const [c0, c1, c2] = this.spec.ramp;
    const t = hex(color);
    const k = this.spec.tint;
    return [c0, [c1[0] + (t[0] - c1[0]) * k, c1[1] + (t[1] - c1[1]) * k, c1[2] + (t[2] - c1[2]) * k], c2];
  }

  private add(effect: Effect): void {
    if (this.lost) return;
    this.effects.push(effect);
    this.canvas.style.visibility = 'visible';
  }

  /**
   * Нить через центры карт. Живёт, пока её не погасят. `reach` — насколько она выходит за
   * крайние карты: на этом отрезке истончается и сходит на нет, поэтому концов не видно.
   */
  thread(line: readonly Pt[], color: string, duration: number, reach: number): ThreadFx {
    const s = this.spec;
    const ramp = this.tinted(color);
    const out = (a: Pt, b: Pt): Pt => {
      const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      return { x: a.x + ((a.x - b.x) / l) * reach, y: a.y + ((a.y - b.y) / l) * reach };
    };
    const n = line.length;
    const pts = [out(line[0]!, line[1]!), ...line.slice(1, n - 1), out(line[n - 1]!, line[n - 2]!)];
    const segs = pts.slice(1).map((b, i) => ({ a: pts[i]!, b, len: Math.hypot(b.x - pts[i]!.x, b.y - pts[i]!.y) }));
    const total = segs.reduce((sum, g) => sum + g.len, 0);
    const start = this.now;
    const seed = Math.random();
    const halfW = s.amp * 3 + 34;
    const state = { pulse: 0, fadeAt: Infinity, fadeFor: 1 };
    this.add({
      draw: (now) => {
        const prog = Math.min(1, (now - start) / duration);
        const fade = Math.min(1, Math.max(0, (now - state.fadeAt) / state.fadeFor));
        if (fade >= 1) return false;
        const u = this.use(this.prog.thread, ramp, s);
        const { gl } = this;
        gl.uniform1f(u.uSeed!, seed);
        gl.uniform1f(u.uTotal!, total);
        gl.uniform1f(u.uHead!, prog * (total + 46));
        gl.uniform1f(u.uFade!, fade);
        gl.uniform1f(u.uPulse!, state.pulse);
        gl.uniform1f(u.uHalfW!, halfW);
        gl.uniform1f(u.uAmp!, s.amp);
        gl.uniform1f(u.uFreq!, s.freq);
        gl.uniform1f(u.uSpeed!, s.speed);
        gl.uniform1f(u.uW!, s.width);
        gl.uniform1f(u.uFlow!, s.flow);
        gl.uniform1f(u.uTaper!, reach * 1.15);
        state.pulse *= 0.9;
        let off = 0;
        for (const g of segs) {
          const dx = (g.b.x - g.a.x) / g.len;
          const dy = (g.b.y - g.a.y) / g.len;
          gl.uniform1f(u.uHalf!, g.len / 2);
          gl.uniform1f(u.uOff!, off);
          this.quad(u, (g.a.x + g.b.x) / 2, (g.a.y + g.b.y) / 2, (dx * g.len) / 2, (dy * g.len) / 2, -dy * halfW, dx * halfW);
          off += g.len;
        }
        return true;
      },
    });
    return {
      pulse: () => {
        state.pulse = 1;
      },
      fade: (d) => {
        state.fadeAt = this.now;
        state.fadeFor = d;
      },
    };
  }

  private burstQuad(at: Pt, radius: number, color: string, life: number, power: number, kind: number): void {
    const spec = this.spec;
    const ramp = this.tinted(color);
    const start = this.now;
    const seed = Math.random();
    this.add({
      draw: (now) => {
        const age = (now - start) / life;
        if (age >= 1) return false;
        const u = this.use(this.prog.burst, ramp, spec);
        const { gl } = this;
        gl.uniform1f(u.uSeed!, seed);
        gl.uniform1f(u.uAge!, age);
        gl.uniform1f(u.uPower!, power);
        gl.uniform1f(u.uKind!, kind);
        this.quad(u, at.x, at.y, radius, 0, 0, radius);
        return true;
      },
    });
  }

  /** Комета: хвост-нить и яркая голова, летит из точки в точку и гаснет. */
  comet(from: Pt, to: Pt, color: string, duration: number, size: number): void {
    const trail = this.thread([from, to], color, duration, 8);
    const ramp = this.tinted(color);
    const spec = this.spec;
    const start = this.now;
    const seed = Math.random();
    this.add({
      draw: (now) => {
        const k = (now - start) / duration;
        if (k >= 1) {
          trail.fade(0.22);
          return false;
        }
        const u = this.use(this.prog.burst, ramp, spec);
        const { gl } = this;
        gl.uniform1f(u.uSeed!, seed);
        gl.uniform1f(u.uAge!, 0.12);
        gl.uniform1f(u.uPower!, 1);
        gl.uniform1f(u.uKind!, 3);
        this.quad(u, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, size * 1.5, 0, 0, size * 1.5);
        return true;
      },
    });
  }

  /** Блик звезды: короткий крест лучей. */
  glint(at: Pt, radius: number, color: string, life = 0.42, power = 1): void {
    this.burstQuad(at, radius, color, life, power, 3);
  }

  /** Тонкое кольцо из газа: линия замкнулась. */
  ring(at: Pt, radius: number, color: string, life = 0.7, power = 1): void {
    this.burstQuad(at, radius, color, life, power, 2);
  }

  /** Главный удар хода: у каждого характера свой. */
  finale(at: Pt, radius: number, color: string, power: number): void {
    this.anchor = at;
    const life = this.spec.mode === 1 ? 1.9 : 1.25;
    this.burstQuad(at, radius, color, life, power, 0);
  }

  /** Звёзды на видеокарте: в кадре один вызов на всю россыпь. */
  sparks(at: Pt, spread: Pt, count: number, color: string, life: number, size: number, fly = 1): void {
    const s = this.spec;
    const ramp = this.tinted(color);
    const start = this.now;
    const seed = Math.random();
    this.add({
      draw: (now) => {
        const age = (now - start) / life;
        if (age >= 1) return false;
        const u = this.use(this.prog.points, ramp, s);
        const { gl } = this;
        gl.uniform2f(u.uAt!, at.x, at.y);
        gl.uniform2f(u.uSpread!, spread.x, spread.y);
        gl.uniform1f(u.uAge!, age);
        gl.uniform1f(u.uLife!, life);
        gl.uniform1f(u.uFly!, s.fly * fly);
        gl.uniform1f(u.uCurl!, s.curl);
        gl.uniform1f(u.uSize!, size);
        gl.uniform1f(u.uSeed!, seed);
        gl.uniform1f(u.uDpr!, this.scale);
        gl.drawArrays(gl.POINTS, 0, count);
        return true;
      },
    });
  }

  /** Карта уходит с поля по правилам характера. Обещание — когда от неё ничего не осталось. */
  depart(card: HTMLCanvasElement, rect: Rect, color: string, delay: number, duration: number): Promise<void> {
    const { gl } = this;
    const spec = this.spec;
    const ramp = this.tinted(color);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, card);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const start = this.now + delay;
    const seed = Math.random();
    const mode = spec.mode;
    const life = mode === 0 ? duration * 1.9 : duration;
    const grid: [number, number] = this.guard.level > 0 ? [30, 42] : [52, 74];
    const hole = this.anchor;
    const reach = Math.hypot(rect.x + rect.w / 2 - hole.x, rect.y + rect.h / 2 - hole.y) + rect.h;
    const rot = rect.rot ?? 0;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    return new Promise((resolve) => {
      if (this.lost) {
        resolve();
        return;
      }
      this.waiting.add(resolve);
      this.add({
        draw: (now) => {
          const prog = Math.max(0, (now - start) / life);
          if (prog >= 1) {
            gl.deleteTexture(tex);
            this.waiting.delete(resolve);
            resolve();
            return false;
          }
          const u = this.use(this.prog.card, ramp, spec);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(u.uCard!, 1);
          gl.uniform1f(u.uSeed!, seed);
          gl.uniform1f(u.uProg!, mode === 0 ? prog * 1.5 : prog);
          if (u.uRectMin) gl.uniform2f(u.uRectMin, rect.x, rect.y);
          if (u.uRectSize) gl.uniform2f(u.uRectSize, rect.w, rect.h);
          if (mode === 1) {
            gl.uniform2f(u.uHole!, hole.x, hole.y);
            gl.uniform2f(u.uRes2!, reach, reach);
            this.quad(u, hole.x, hole.y, reach, 0, 0, reach);
          } else {
            this.quad(u, rect.x + rect.w / 2, rect.y + rect.h / 2, (rect.w / 2) * ca, (rect.w / 2) * sa, (-rect.h / 2) * sa, (rect.h / 2) * ca);
          }
          if (mode === 0) {
            const d = this.use(this.prog.dust, ramp, spec);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.uniform1i(d.uCard!, 1);
            gl.uniform2f(d.uGrid!, grid[0], grid[1]);
            gl.uniform2f(d.uRectMin!, rect.x, rect.y);
            gl.uniform2f(d.uRectSize!, rect.w, rect.h);
            gl.uniform1f(d.uProg!, prog * 1.5);
            gl.uniform1f(d.uSeed!, seed);
            gl.uniform1f(d.uDpr!, this.scale);
            gl.uniform1f(d.uFly!, 74);
            gl.uniform1f(d.uRot!, rot);
            gl.drawArrays(gl.POINTS, 0, grid[0] * grid[1]);
          }
          return true;
        },
      });
    });
  }

  /** Мир гаснет вокруг линий. Новая линия открывает себе окно, `release` возвращает свет. */
  focus(first: Rect, strength: number): FocusFx {
    const state = { value: 0, target: strength, rate: strength / 0.22 };
    const holes = [{ rect: first, open: 1 }];
    const spec = this.spec;
    const ramp = spec.ramp;
    let last = this.now;
    this.add({
      draw: (now) => {
        const dt = now - last;
        last = now;
        const dir = Math.sign(state.target - state.value);
        state.value = dir > 0 ? Math.min(state.target, state.value + state.rate * dt) : Math.max(state.target, state.value - state.rate * dt);
        if (state.value <= 0 && state.target <= 0) return false;
        const u = this.use(this.prog.focus, ramp, spec);
        const { gl } = this;
        for (const h of holes) h.open = Math.min(1, h.open + dt / 0.22);
        const shown = holes.slice(-3);
        gl.uniform2f(u.uRes2!, this.width, this.height);
        gl.uniform4fv(u['uHoles[0]']!, shown.flatMap((h) => [h.rect.x + h.rect.w / 2, h.rect.y + h.rect.h / 2, h.rect.w / 2, h.rect.h / 2]));
        gl.uniform1fv(u['uOpens[0]']!, shown.map((h) => h.open));
        gl.uniform1i(u.uCount!, shown.length);
        gl.uniform1f(u.uStr!, state.value);
        this.quad(u, this.width / 2, this.height / 2, this.width / 2, 0, 0, this.height / 2);
        return true;
      },
    });
    return {
      add: (rect) => {
        holes.push({ rect, open: 0 });
      },
      release: (duration) => {
        state.target = 0;
        state.rate = strength / Math.max(0.01, duration);
      },
    };
  }

  /** Пространство гнётся. Снимок поля берётся один раз: в момент удара всё и так почти стоит. */
  wave(source: HTMLCanvasElement, at: Pt, reach: number, life: number, strength = 1): void {
    // Снимок поля самая дорогая часть удара: в облегчённом слое обходимся без него
    if (this.guard.level > 0 || this.lost) return;
    const { gl } = this;
    const snap = this.snapCanvas;
    snap.width = Math.round(this.width);
    snap.height = Math.round(this.height);
    snap.getContext('2d')!.drawImage(source, 0, 0, snap.width, snap.height);
    this.snapTex ??= gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.snapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const start = this.now;
    const seed = Math.random();
    const spec = this.spec;
    const ramp = spec.ramp;
    this.add({
      draw: (now) => {
        const age = (now - start) / life;
        if (age >= 1) return false;
        const u = this.use(this.prog.wave, ramp, spec);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.snapTex);
        gl.uniform1i(u.uSnap!, 1);
        gl.uniform2f(u.uRes2!, this.width, this.height);
        gl.uniform2f(u.uAt!, at.x, at.y);
        gl.uniform1f(u.uSeed!, seed);
        gl.uniform1f(u.uAge!, age);
        gl.uniform1f(u.uReach!, reach);
        gl.uniform1f(u.uStrength!, strength);
        this.quad(u, this.width / 2, this.height / 2, this.width / 2, 0, 0, this.height / 2);
        return true;
      },
    });
  }

  /** Кадр слоя. Время то же, что у игры: при замирании эффект замирает вместе с ней. */
  update(dt: number, frameSeconds: number, camX: number, camY: number, camScale: number): void {
    this.now += dt;
    if (this.lost) return;
    if (this.pendingBuild) {
      this.prepare();
      return;
    }
    if (this.effects.length === 0) {
      if (this.dirty) {
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.canvas.style.visibility = 'hidden';
        this.dirty = false;
      }
      if (this.ambient) this.judge(frameSeconds);
      return;
    }
    if (!this.dirty) this.guard.begin();
    this.cam = [camX, camY, camScale];
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.effects = this.effects.filter((e) => e.draw(this.now));
    this.dirty = true;
    this.judge(frameSeconds);
  }

  private judge(frameSeconds: number): void {
    const level = this.guard.frame(frameSeconds * 1000);
    if (level === null) return;
    if (level === 1) this.resize(this.width, this.height, this.dpr);
    this.onState(level === 1 ? 'lite' : 'off', level);
  }
}
