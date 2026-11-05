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
    tint: 0.25, amp: 7, freq: 0.012, speed: 1.4, width: 1.15, heat: 0.7, flow: 2.4, fly: 90, curl: 110,
  },
  hole: {
    mode: 1,
    ramp: [hex('#25105c'), hex('#8a63ff'), hex('#ffd9a8')],
    gas: [hex('#ff8a3d'), hex('#7a4dff')],
    tint: 0.15, amp: 10, freq: 0.01, speed: 1, width: 1.4, heat: 0.66, flow: -3.2, fly: 60, curl: 60,
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

const COMMON = `#version 300 es
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
const FRAG_THREAD = COMMON + `
uniform float uHalf, uHalfW, uOff, uTotal, uHead, uFade, uPulse, uAmp, uFreq, uSpeed, uW, uFlow;
void main() {
  float U = uOff + (vL.x * 0.5 + 0.5) * uHalf * 2.0;
  float v = vL.y * uHalfW;
  vec2 px = gl_FragCoord.xy / uPx;
  float y = (nz(vec2(U * 0.0016 - uT * 0.02, uSeed)) - 0.5) * uAmp * 2.0 + sin(U * uFreq - uT * uSpeed + uSeed * 6.0) * uAmp * 0.35;
  float d = abs(v - y);
  float head = smoothstep(uHead + 3.0, uHead - 40.0, U);
  float ends = smoothstep(0.0, 18.0, U) * smoothstep(uTotal, uTotal - 18.0, U);
  float side = smoothstep(uHalfW, uHalfW * 0.6, abs(v));
  float eat = smoothstep(uFade * 1.25 - 0.25, uFade * 1.25, nm(vec2(U * 0.0052, v * 0.012 + 0.4)));
  float m = head * eat * side;
  float flow = nm(vec2(U * 0.0042 - uT * 0.12, v * 0.009 + uSeed));
  float e = exp(-d * d / (uW * uW)) * (0.75 + 0.6 * flow) + exp(-d / (uW * 6.0)) * 0.3;
  float bs = U * 0.03 - uT * uFlow;
  float ci = floor(bs);
  float h = h21(vec2(ci, uSeed * 13.0));
  vec2 q = vec2((fract(bs) - 0.5) / 0.03, v - y - (h - 0.5) * 24.0);
  float st = star4(q, 1.5 + h * 3.2) * step(0.22, h) * (0.55 + 0.45 * sin(uT * 8.0 + h * 30.0));
  e = (e * (1.0 + uPulse * 1.5) + st * 1.5) * m * mix(0.5, 1.0, ends);
  float dens;
  vec3 gas = nebula(px * 0.0022 + uSeed, dens) * dens * exp(-abs(v - y) / 17.0) * 0.5 * m;
  frag = vec4(ramp(clamp(e * uHeat, 0.0, 1.1)) * min(e, 1.0) + gas, 0.0);
}`;

/** Удар: сжатие и сверхновая или чёрная дыра с диском; малые — блик и кольцо. */
const FRAG_BURST = COMMON + `
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
const FRAG_CARD = COMMON + `
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
uniform float uProg, uSeed, uDpr, uFly;
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
  vec2 p = uRectMin + uv * uRectSize;
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

/** Мир затихает вокруг линии: тёмная завеса с рваным краем, окно вокруг карт. */
const FRAG_FOCUS = COMMON + `
uniform vec2 uHoleC, uHoleH, uRes2;
uniform float uStr;
void main() {
  vec2 px = (vL * 0.5 + 0.5) * uRes2;
  vec2 q = abs(px - uHoleC) - uHoleH;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float n = (nz(px * 0.0016 + uT * 0.012) - 0.5) * 56.0;
  float a = smoothstep(-6.0, 70.0, sd + n) * uStr;
  frag = vec4(uC0 * 0.06 * a, a);
}`;

/** Пространство гнётся по снимку поля: кольцо волны или закрутка вокруг дыры. */
const FRAG_WAVE = COMMON + `
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
type Rect = { x: number; y: number; w: number; h: number };

interface Effect {
  /** Рисует кадр; false — эффект закончился. */
  draw(now: number): boolean;
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

function tileNoise(size: number, cells: number, seed: number, octaves: number, ridge: boolean): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let s = seed;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lattice = new Float32Array(n * n);
    for (let i = 0; i < lattice.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      lattice[i] = s / 4294967296;
    }
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const at = (a: number, b: number): number => lattice[(b % n) * n + (a % n)]!;
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        const v = top + (bot - top) * sy;
        out[y * size + x]! += (ridge ? 1 - Math.abs(v * 2 - 1) : v) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

/** Растянуть значения на весь диапазон: без этого пороги шума срабатывают только в середине. */
function stretch(a: Float32Array): Float32Array {
  let lo = 1;
  let hi = 0;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = 1 / Math.max(0.0001, hi - lo);
  return a.map((v) => (v - lo) * k);
}

export class GlFx {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  /** Характер текущего хода; эффект запоминает его при создании и доживает в нём. */
  private spec: LookSpec;
  private readonly prog: Record<'thread' | 'burst' | 'card' | 'dust' | 'focus' | 'wave' | 'points', Program>;
  private readonly noise: WebGLTexture;
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
  /** Центр главного удара: чёрная дыра затягивает карты именно туда. */
  private anchor: Pt = { x: 0, y: 0 };
  /** Сколько миллисекунд заняла сборка шейдеров и шума при запуске. */
  readonly setupMs: number;

  static create(host: HTMLElement): GlFx | null {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-gl';
    canvas.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;visibility:hidden';
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    try {
      return new GlFx(host, canvas, gl);
    } catch (e) {
      console.error('Слой шейдеров не собрался', e);
      return null;
    }
  }

  private constructor(host: HTMLElement, canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    const begin = performance.now();
    this.canvas = canvas;
    this.gl = gl;
    this.spec = LOOKS.nova;
    const quad = this.shader(gl.VERTEX_SHADER, VERT_QUAD);
    this.prog = {
      thread: this.program(quad, FRAG_THREAD),
      burst: this.program(quad, FRAG_BURST),
      card: this.program(quad, FRAG_CARD),
      focus: this.program(quad, FRAG_FOCUS),
      wave: this.program(quad, FRAG_WAVE),
      dust: this.program(this.shader(gl.VERTEX_SHADER, VERT_DUST), FRAG_DUST),
      points: this.program(this.shader(gl.VERTEX_SHADER, VERT_POINTS), FRAG_POINTS),
    };
    gl.bindVertexArray(gl.createVertexArray());
    this.noise = this.makeNoise();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    host.append(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.effects = [];
      canvas.style.visibility = 'hidden';
    });
    this.setupMs = performance.now() - begin;
  }

  private shader(type: number, src: string): WebGLShader {
    const { gl } = this;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'шейдер не собрался');
    return s;
  }

  private program(vert: WebGLShader, frag: string): Program {
    const { gl } = this;
    const p = gl.createProgram()!;
    gl.attachShader(p, vert);
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'программа не собралась');
    const u: Uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { gl: p, u };
  }

  private makeNoise(): WebGLTexture {
    const { gl } = this;
    const size = 256;
    const r = stretch(tileNoise(size, 4, 11, 4, false));
    const g = stretch(tileNoise(size, 8, 29, 5, false));
    const b = stretch(tileNoise(size, 6, 47, 4, true));
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = r[i]! * 255;
      data[i * 4 + 1] = g[i]! * 255;
      data[i * 4 + 2] = b[i]! * 255;
      data[i * 4 + 3] = 255;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  /** Размер слоя; чёткость выше двойной на эффекте не видна, а телефону стоит дорого. */
  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.scale = Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.scale);
    this.canvas.height = Math.round(height * this.scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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

  /** Нить через центры карт. Живёт, пока её не погасят. */
  thread(pts: readonly Pt[], color: string, duration: number): ThreadFx {
    const s = this.spec;
    const ramp = this.tinted(color);
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
    const grid: [number, number] = [52, 74];
    const hole = this.anchor;
    const reach = Math.hypot(rect.x + rect.w / 2 - hole.x, rect.y + rect.h / 2 - hole.y) + rect.h;
    return new Promise((resolve) => {
      if (this.lost) {
        resolve();
        return;
      }
      this.add({
        draw: (now) => {
          const prog = Math.max(0, (now - start) / life);
          if (prog >= 1) {
            gl.deleteTexture(tex);
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
            this.quad(u, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, 0, rect.h / 2);
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
            gl.drawArrays(gl.POINTS, 0, grid[0] * grid[1]);
          }
          return true;
        },
      });
    });
  }

  /** Мир гаснет вокруг прямоугольника; возвращает функцию, которая возвращает свет. */
  focus(hole: Rect, strength: number): (duration: number) => void {
    const state = { value: 0, target: strength, rate: strength / 0.22 };
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
        gl.uniform2f(u.uRes2!, this.width, this.height);
        gl.uniform2f(u.uHoleC!, hole.x + hole.w / 2, hole.y + hole.h / 2);
        gl.uniform2f(u.uHoleH!, hole.w / 2, hole.h / 2);
        gl.uniform1f(u.uStr!, state.value);
        this.quad(u, this.width / 2, this.height / 2, this.width / 2, 0, 0, this.height / 2);
        return true;
      },
    });
    return (duration) => {
      state.target = 0;
      state.rate = strength / Math.max(0.01, duration);
    };
  }

  /** Пространство гнётся. Снимок поля берётся один раз: в момент удара всё и так почти стоит. */
  wave(source: HTMLCanvasElement, at: Pt, reach: number, life: number, strength = 1): void {
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
  update(dt: number, camX: number, camY: number, camScale: number): void {
    this.now += dt;
    if (this.lost) return;
    if (this.effects.length === 0) {
      if (this.dirty) {
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.canvas.style.visibility = 'hidden';
        this.dirty = false;
      }
      return;
    }
    this.cam = [camX, camY, camScale];
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.effects = this.effects.filter((e) => e.draw(this.now));
    this.dirty = true;
  }
}
