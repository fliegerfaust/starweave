import { FRAG_NOISE, SHADER_COMMON, VERT_FULL } from './gl-fx';

type Rgb = [number, number, number];

const VERT = `#version 300 es
precision highp float;
out vec2 vL;
void main() {
  vec2 a = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vL = a;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

/**
 * Чёрное солнце: диск за полем, корона в полях и швах. Рисуется шейдером на маленьком холсте,
 * а сцена кладёт его как фон под карты, поэтому карты всегда читаются.
 */
const FRAG = SHADER_COMMON + `
uniform float uHit, uCrack, uGone, uFocus, uSpin, uSpike, uHp, uLayers;
void main() {
  vec2 p = vL * 1.62;
  float r = length(p);
  float ang = atan(p.y, p.x) + uT * uSpin;
  float a = ang * 0.15915 + 0.5;
  float mr = r;
  float moon = smoothstep(1.015, 0.995, mr) * (1.0 - uGone);

  float s1 = nz(vec2(a * 2.0, r * 0.16 - uT * 0.018 + uSeed));
  float s2 = nm(vec2(a * 5.0, r * 0.3 - uT * 0.05));
  float stream = pow(s1 * 0.72 + s2 * 0.52, 2.0);
  stream = mix(stream, pow(abs(cos(ang * 6.0)), 18.0) * 1.3, uSpike);
  float lean = 0.72 + 0.5 * max(0.0, dot(normalize(p + 0.0001), uFocus > 0.0 ? vec2(cos(uFocus), sin(uFocus)) : vec2(0.0)));
  float fall = exp(-max(r - 1.0, 0.0) * 1.7) * smoothstep(0.96, 1.02, r);
  float corona = stream * fall * lean * (1.2 + uHit * 1.1);

  float dens;
  vec3 gas = nebula(p * 0.2 + uSeed, dens);
  float cells = nm(p * 0.34 + uT * 0.01) * 0.65 + nr(p * 0.7 - uT * 0.012) * 0.35;
  vec3 sun = mix(uC2, uC1, smoothstep(0.2, 1.05, r)) * (0.1 + 0.4 * cells * cells);
  sun *= smoothstep(1.01, 0.99, r);

  float limb = exp(-pow((mr - 1.0) / 0.012, 2.0)) * smoothstep(1.08, 0.96, r) * (1.0 - uGone);
  float beads = limb * smoothstep(0.58, 0.82, nr(vec2(a * 3.5, uSeed))) * (1.0 + uHit * 2.4);
  float rim = limb * 0.75;

  float crackN = nr(p * 0.3 + uSeed * 0.3) * 0.8 + nr(vec2(a * 1.4, r * 0.1)) * 0.3;
  float reach = uCrack * 0.5;
  float crackMask = smoothstep(reach + 0.04, reach - 0.14, abs(r - 0.62)) + step(1.5, uCrack) * smoothstep(1.0, 0.1, r) * 0.7;
  /* Трещина — тонкая линия уровня шума, а не пятно: светится только сам излом. */
  float vein = abs(crackN - 0.66);
  float mask = moon * clamp(crackMask, 0.0, 1.0) * step(0.5, uCrack);
  float crack = (1.0 - smoothstep(0.0, 0.007, vein)) * mask;
  float glow = (1.0 - smoothstep(0.0, 0.05, vein)) * mask * 0.28;

  vec3 col = sun * (1.0 - moon);
  col += (uC1 * 0.75 + gas * dens * 0.55 + uC2 * stream * 0.4) * corona;
  col += vec3(1.0, 0.97, 0.9) * (rim + beads);
  col += ramp(0.92) * crack * 1.1 + uC1 * glow;
  /* Кольца сил: внешнее тает с уроном, по часовой от верха; внутренние целы. */
  float turn = fract(atan(p.x, -p.y) * 0.15915 + 1.0);
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uLayers) break;
    float rr = 1.12 + 0.1 * float(i);
    bool current = float(i) == uLayers - 1.0;
    float full = current ? smoothstep(uHp + 0.004, uHp - 0.004, turn) : 1.0;
    float band = exp(-pow((r - rr) / 0.016, 2.0));
    float halo = exp(-abs(r - rr) / 0.04) * 0.3;
    float tip = current ? exp(-pow((turn - uHp) / 0.012, 2.0)) * band * (1.5 + uHit * 3.0) : 0.0;
    col += (mix(uC1, vec3(1.0, 0.97, 0.92), 0.65) * (band * 1.25 + halo) * full + uC1 * band * 0.1 * (1.0 - full) + vec3(1.0, 0.9, 0.7) * tip) * (1.0 - uGone);
  }
  /* Корона сходит на нет раньше края холста: квадрата не видно. */
  col *= smoothstep(1.6, 1.22, r);
  float light = clamp(max(max(col.r, col.g), col.b) * 1.5, 0.0, 1.0);
  float alpha = max(moon, light);
  frag = vec4(col + vec3(0.012, 0.01, 0.03) * moon, alpha);
}`;

export interface SunState {
  /** Удар: 1 сразу после попадания, гаснет сам. */
  hit: number;
  /** Сколько раз его уже ранили в этой главе: 0, 1, 2. */
  crack: number;
  /** Разбито: 0…1. */
  gone: number;
  /** Запас сил текущего кольца: 1…0. */
  hp: number;
  /** Сколько колец осталось: 3, 2, 1. */
  layers: number;
  /** Куда смотрит сгусток короны, радианы; 0 — никуда. */
  focus: number;
}

/** Характер короны по правилу Затмения: один шейдер, разные числа. */
export interface SunLook {
  corona: Rgb;
  hot: Rgb;
  gas: [Rgb, Rgb];
  spin: number;
  spike: number;
}

const hex = (s: string): Rgb => {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const BASE: SunLook = { corona: hex('#8f7bff'), hot: hex('#ffe9c4'), gas: [hex('#7a4dff'), hex('#39d5ff')], spin: 0.02, spike: 0 };

/** Правило видно по короне. */
export function sunLook(bossId: string | undefined): SunLook {
  const suit: Record<string, string> = { 'eclipse-sun': '#ffc95c', 'eclipse-moon': '#8fd0ff', 'eclipse-star': '#c39bff', 'eclipse-comet': '#ff7f62' };
  if (bossId && suit[bossId]) return { ...BASE, corona: hex(suit[bossId]!) };
  if (bossId === 'silence') return { ...BASE, spin: 0, corona: hex('#e8e4f4') };
  if (bossId === 'shortNight') return { ...BASE, spin: 0.35 };
  if (bossId === 'gravity' || bossId === 'judge') return { ...BASE, spike: 0.85, corona: hex('#e8e4f4') };
  if (bossId === 'hunger') return { ...BASE, spin: -0.12, gas: [hex('#f6c25b'), hex('#7a4dff')] };
  return BASE;
}

export class BlackSun {
  readonly canvas = document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  private readonly seed = Math.random();
  private frame = 0;
  private time = 0;
  private dirty = false;
  /** Браузер отобрал графику: небо рисуется по-старому до конца ночи. */
  lost = false;
  readonly state: SunState = { hit: 0, crack: 0, gone: 0, hp: 1, layers: 1, focus: 0 };

  static create(size: number, look: SunLook): BlackSun | null {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    try {
      return new BlackSun(canvas, gl, size, look);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, size: number, private readonly look: SunLook) {
    this.canvas = canvas;
    this.gl = gl;
    canvas.width = canvas.height = size;
    canvas.addEventListener('webglcontextlost', () => {
      this.lost = true;
    });
    const link = (vs: string, fs: string): WebGLProgram => {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      return p;
    };
    gl.bindVertexArray(gl.createVertexArray());
    // Шум тот же, что у слоя удара: один материал
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 256, 256);
    gl.useProgram(link(VERT_FULL, FRAG_NOISE));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.viewport(0, 0, size, size);
    this.program = link(VERT, FRAG);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) ?? 'шейдер солнца не собрался');
    const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(this.program, i)!.name;
      this.u[name] = gl.getUniformLocation(this.program, name);
    }
    this.render();
  }

  /**
   * Корона движется медленно, поэтому рисуем не каждый кадр: `every` 2 — через кадр, 4 — на
   * слабом устройстве, 0 — картинка стоит и меняется только от урона.
   */
  update(dt: number, every: number): void {
    if (this.lost) return;
    this.time += dt;
    this.state.hit = Math.max(0, this.state.hit - dt * 1.5);
    this.frame++;
    const beat = every > 0 && (this.frame % every === 0 || this.state.hit > 0);
    if (beat || this.dirty) this.render();
    this.dirty = false;
  }

  /** Состояние сменилось: перерисовать, даже если картинка стоит. */
  touch(): void {
    this.dirty = true;
  }

  /** Контекстов WebGL у страницы мало: каждое Затмение отдаёт свой обратно. */
  destroy(): void {
    this.lost = true;
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private render(): void {
    const { gl, u, state: s, look } = this;
    gl.useProgram(this.program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const set = (name: string, v: number): void => {
      if (u[name]) gl.uniform1f(u[name], v);
    };
    set('uT', this.time);
    set('uSeed', this.seed);
    set('uHeat', 1);
    set('uPx', 1);
    set('uHit', s.hit);
    set('uCrack', s.crack);
    set('uGone', s.gone);
    set('uHp', s.hp);
    set('uLayers', s.layers);
    set('uFocus', s.focus);
    set('uSpin', look.spin);
    set('uSpike', look.spike);
    if (u.uC0) gl.uniform3f(u.uC0, 0.03, 0.02, 0.1);
    if (u.uC1) gl.uniform3fv(u.uC1, look.corona);
    if (u.uC2) gl.uniform3fv(u.uC2, look.hot);
    if (u.uN1) gl.uniform3fv(u.uN1, look.gas[0]);
    if (u.uN2) gl.uniform3fv(u.uN2, look.gas[1]);
    if (u.uNoise) gl.uniform1i(u.uNoise, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
