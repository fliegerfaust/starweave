import { CARD_ASPECT, CARD_PAD, cardFace } from '@/art/card';
import { roundRect, sparklePath } from '@/art/glyphs';
import { BODY_FONT, DISPLAY_FONT } from '@/art/palette';
import type { Card } from '@/core/types';
import { t } from '@/i18n';

/**
 * Картинки бота и витрин (FP.9, выбор Дениса — круг 2, docs/vitrines/fp9-telegram-r2.html):
 * знак «Печать» — медальон «Эмали» с золотой звездой (аватар и иконки), обложка «Купол» —
 * щель обсерватории с Большой Медведицей и линией из четырёх мастей на золотой нити, справа
 * название и печать под ним, картинка описания — крест на небе 4×4 в щели купола.
 */

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];
type Stops = [number, string][];
type Face = Pick<Card, 'suit' | 'rank' | 'glyph'>;

const { PI, cos, sin, max, min, round } = Math;
const TAU = PI * 2;

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function hexRgb(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, k: number): string {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  return '#' + pa.map((v, i) => round(v + (pb[i]! - v) * k).toString(16).padStart(2, '0')).join('');
}
/** Детерминированный «случай» — картинка одинакова при каждой генерации. */
function rand(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function stops(g: CanvasGradient, l: Stops): CanvasGradient {
  for (const [o, c] of l) g.addColorStop(o, c);
  return g;
}
const lin = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, l: Stops) => stops(ctx.createLinearGradient(x0, y0, x1, y1), l);
const rad = (ctx: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, l: Stops) =>
  stops(ctx.createRadialGradient(x0, y0, r0, x1, y1, r1), l);
function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}
/** Мягкое свечение сложением цветов. */
function halo(ctx: Ctx, x: number, y: number, r: number, rgb: Rgb, a: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [[0, rgba(rgb, a)], [1, rgba(rgb, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function starsField(ctx: Ctx, w: number, h: number, n: number, seed: number, size: number, alpha: number): void {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = size * (0.5 + r());
    ctx.fillStyle = `rgba(225,220,255,${alpha * (0.35 + r() * 0.65)})`;
    circle(ctx, x, y, s);
    ctx.fill();
  }
}

const GOLD: Stops = [[0, '#fff6d6'], [0.45, '#f6c25b'], [1, '#b8751c']];
const BRASS: Stops = [[0, '#fff6d8'], [0.3, '#f2b84e'], [0.56, '#9a5410'], [0.8, '#ffcf6a'], [1, '#fff2cc']];
const NIGHT = { base: '#3346b0', deep: '#080c3a', hi: '#d6deff' };

// ─── Печать: медальон «Эмали» ───────────────────────────────────────────────

type Motif = (ctx: Ctx, s: number) => void;
const STARLIGHT: Motif = (ctx, s) => {
  ctx.beginPath();
  sparklePath(ctx, 0, 0, s * 1.12, 4, 0.27);
  sparklePath(ctx, s * 0.74, -s * 0.74, s * 0.24, 4, 0.3);
  sparklePath(ctx, -s * 0.72, s * 0.7, s * 0.17, 4, 0.3);
  ctx.fill();
};
const BIG_STAR: Motif = (ctx, s) => {
  ctx.beginPath();
  sparklePath(ctx, 0, 0, s * 1.2, 4, 0.26);
  ctx.fill();
};

/** Медальон радиусом R: латунная оправа, ночная эмаль с гильоше, звезда золотым рельефом. */
function medal(ctx: Ctx, x: number, y: number, R: number, o: { motif: Motif; s: number; detail?: boolean; beads?: boolean; crown?: boolean }): void {
  const er = 41;
  const detail = o.detail !== false;
  const f = NIGHT;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(R / 47, R / 47);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  circle(ctx, 0, 1.8, 49.5);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = lin(ctx, -47, -47, 47, 47, BRASS);
  circle(ctx, 0, 0, 47);
  ctx.fill();
  if (detail) {
    ctx.strokeStyle = 'rgba(255,247,220,0.55)';
    ctx.lineWidth = 0.8;
    circle(ctx, 0, 0, 46.3);
    ctx.stroke();
  }
  ctx.fillStyle = rad(ctx, 0, -er * 0.4, 0, 0, -er * 0.4, er * 1.56, [[0, mixHex(f.base, '#ffffff', 0.08)], [0.5, mixHex(f.base, f.deep, 0.5)], [1, f.deep]]);
  circle(ctx, 0, 0, er);
  ctx.fill();
  if (detail) {
    ctx.strokeStyle = f.hi;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      ctx.moveTo(cos(a) * 9, sin(a) * 9);
      ctx.lineTo(cos(a) * 40, sin(a) * 40);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, er, [[0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  circle(ctx, 0, 0, er);
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,24,4,0.8)';
  ctx.lineWidth = 1.4;
  circle(ctx, 0, 0, er + 0.2);
  ctx.stroke();
  // Золотой рельеф: тень снизу, затем знак золотым градиентом
  ctx.save();
  ctx.translate(0, 2.2);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#000';
  o.motif(ctx, o.s);
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, -o.s, 0, o.s, GOLD);
  o.motif(ctx, o.s);
  if (o.beads) {
    ctx.fillStyle = 'rgba(255,244,208,0.85)';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU - PI / 2;
      if (o.crown && Math.abs(a + PI / 2) < 0.2) continue;
      circle(ctx, cos(a) * 44, sin(a) * 44, 1.15);
      ctx.fill();
    }
  }
  if (o.crown) {
    ctx.beginPath();
    sparklePath(ctx, 0, -44, 6.6, 4, 0.3);
    ctx.fillStyle = '#fffbe8';
    ctx.fill();
    ctx.strokeStyle = '#8a5a14';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.restore();
}

/** Знак «Печать» на квадрате s×s: ночь, гравированная шкала неба по кругу и медальон. */
export function drawSeal(ctx: Ctx, s: number): void {
  const c = s / 2;
  ctx.fillStyle = rad(ctx, c, c * 0.85, 0, c, c, s * 0.72, [[0, '#211c5c'], [0.5, '#0f0d33'], [1, '#05040f']]);
  ctx.fillRect(0, 0, s, s);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,218,150,0.16)';
  ctx.lineWidth = s * 0.0025;
  circle(ctx, c, c, s * 0.475);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    const l = i % 6 === 0 ? 0.035 : 0.018;
    ctx.moveTo(c + cos(a) * s * 0.475, c + sin(a) * s * 0.475);
    ctx.lineTo(c + cos(a) * s * (0.475 - l), c + sin(a) * s * (0.475 - l));
  }
  ctx.stroke();
  ctx.restore();
  starsField(ctx, s, s, 34, 5, s * 0.0016, 0.6);
  halo(ctx, c, c, s * 0.5, [246, 194, 91], 0.14);
  medal(ctx, c, c, s * 0.4, { motif: STARLIGHT, s: 26.5, beads: true, crown: true });
}

// ─── Купол обсерватории ─────────────────────────────────────────────────────

function slitPath(ctx: Ctx, x0: number, x1: number, y0: number, yb: number): void {
  const r = (x1 - x0) / 2;
  ctx.beginPath();
  ctx.moveTo(x0, yb);
  ctx.lineTo(x0, y0 + r);
  ctx.arc((x0 + x1) / 2, y0 + r, r, PI, 0);
  ctx.lineTo(x1, yb);
  ctx.closePath();
}

/** Оболочка купола: тёмная заливка, кольца и рёбра тонкой латунью. */
function domeShell(ctx: Ctx, W: number, H: number, x0: number, x1: number, y0: number, yb: number): void {
  const sh = yb - y0;
  const r = (x1 - x0) / 2;
  ctx.fillStyle = rad(ctx, W / 2, H * 0.22, 0, W / 2, H * 0.22, max(W, H) * 0.9, [[0, '#1d1a52'], [0.45, '#0d0b2a'], [1, '#05040f']]);
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = 'rgba(246,194,91,0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 9; i++) {
    const ry = sh * 0.55 + i * i * (H / 30);
    ctx.moveTo(W / 2 + ry * 1.25, y0 - sh * 0.25);
    ctx.ellipse(W / 2, y0 - sh * 0.25, ry * 1.25, ry, 0, 0, TAU);
  }
  const R = max(W, H) * 1.05;
  for (let i = -6; i <= 6; i++) {
    if (!i) continue;
    const a = i * 0.2;
    ctx.moveTo(W / 2 + Math.sign(i) * r, 0);
    ctx.lineTo(W / 2 + sin(a) * R, cos(a) * R * 0.9);
  }
  ctx.stroke();
  ctx.restore();
}

/** Небо в щели: глубокий синий с туманностями, полоса Млечного пути и тёплый свет от подоконника. */
function slitSky(ctx: Ctx, x0: number, x1: number, y0: number, yb: number, seed: number, dust: number): void {
  ctx.save();
  slitPath(ctx, x0, x1, y0, yb);
  ctx.clip();
  const sw = x1 - x0;
  const sh = yb - y0;
  ctx.fillStyle = lin(ctx, 0, y0, 0, yb, [[0, '#0c0f38'], [0.45, '#152661'], [0.85, '#1d3478'], [1, '#2a3570']]);
  ctx.fillRect(x0, y0, sw, sh);
  halo(ctx, x0 + sw * 0.82, y0 + sh * 0.2, sw * 0.62, [150, 80, 220], 0.22);
  halo(ctx, x0 + sw * 0.12, y0 + sh * 0.45, sw * 0.6, [40, 150, 200], 0.16);
  halo(ctx, x0 + sw * 0.55, y0 + sh * 0.62, sw * 0.5, [190, 70, 170], 0.1);
  const r = rand(seed);
  const k = max(1, sw / 260);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260 * dust; i++) {
    const tt = r();
    const off = (r() + r() + r() - 1.5) * 0.18;
    ctx.fillStyle = `rgba(220,225,255,${0.1 + r() * 0.35})`;
    circle(ctx, x0 + sw * (tt + off * 0.5), y0 + sh * (0.05 + tt * 0.7 - off), (0.3 + r() * 0.6) * k);
    ctx.fill();
  }
  for (let i = 0; i < 70 * dust; i++) {
    ctx.fillStyle = `rgba(235,235,255,${0.2 + r() * 0.5})`;
    circle(ctx, x0 + r() * sw, y0 + r() * sh, (0.4 + r() * 0.8) * k);
    ctx.fill();
  }
  ctx.fillStyle = rad(ctx, (x0 + x1) / 2, yb, 0, (x0 + x1) / 2, yb, sh * 0.55, [[0, 'rgba(255,196,110,0.26)'], [1, 'rgba(255,196,110,0)']]);
  ctx.fillRect(x0, y0, sw, sh);
  ctx.restore();
}

/** Латунная кромка щели: пояс градиентом латуни и светлая волосяная линия по внутреннему краю. */
function slitRim(ctx: Ctx, x0: number, x1: number, y0: number, yb: number, lw: number): void {
  const r = (x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = lw * 3;
  ctx.beginPath();
  ctx.moveTo(x0, yb);
  ctx.lineTo(x0, y0 + r);
  ctx.arc(cx, y0 + r, r, PI, 0);
  ctx.lineTo(x1, yb);
  ctx.lineWidth = lw;
  ctx.strokeStyle = lin(ctx, x0, y0, x1, yb, [[0, '#fff0c4'], [0.3, '#dca546'], [0.56, '#7d5214'], [0.8, '#e8b85a'], [1, '#fff2cc']]);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  const i = lw * 0.75;
  ctx.beginPath();
  ctx.moveTo(x0 + i, yb);
  ctx.lineTo(x0 + i, y0 + r);
  ctx.arc(cx, y0 + r, r - i, PI, 0);
  ctx.lineTo(x1 - i, yb);
  ctx.lineWidth = max(0.6, lw * 0.18);
  ctx.strokeStyle = 'rgba(255,240,205,0.55)';
  ctx.stroke();
  ctx.restore();
}

/** Подоконник: светящаяся линия, ярче в центре и гаснет к краям. */
function sillLine(ctx: Ctx, cx: number, y: number, w: number, th: number): void {
  ctx.save();
  ctx.fillStyle = lin(ctx, cx - w / 2, 0, cx + w / 2, 0, [[0, 'rgba(246,194,91,0)'], [0.5, 'rgba(255,230,168,0.9)'], [1, 'rgba(246,194,91,0)']]);
  ctx.fillRect(cx - w / 2, y - th / 2, w, th);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rad(ctx, cx, y, 0, cx, y, w * 0.3, [[0, 'rgba(255,214,140,0.16)'], [1, 'rgba(255,214,140,0)']]);
  ctx.translate(cx, y);
  ctx.scale(1, 0.18);
  ctx.fillRect(-w * 0.3, -w * 0.3, w * 0.6, w * 0.6);
  ctx.restore();
}

/** Большая Медведица: координаты звёзд в процентах рамки, третье число — звёздная величина. */
const BIG_DIPPER = {
  stars: [[78, 30, 1.8], [80, 50, 2.4], [60, 55, 2.4], [57, 38, 3.3], [42, 33, 1.8], [28, 30, 2.2], [12, 40, 1.9]] as const,
  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] as const,
};

/** Созвездие в щели: белые звёзды с ореолом, тонкие золотые линии (как на главной). */
function skyFigure(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const P = BIG_DIPPER.stars.map(([sx, sy, mag]) => [x + (sx / 100) * w, y + (sy / 100) * h, mag] as const);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(246,194,91,0.7)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const [a, b] of BIG_DIPPER.lines) {
    ctx.moveTo(P[a]![0], P[a]![1]);
    ctx.lineTo(P[b]![0], P[b]![1]);
  }
  ctx.stroke();
  for (const [px, py, mag] of P) {
    const r = max(1.4, 3.6 - mag * 0.55) * 1.05;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rad(ctx, px, py, 0, px, py, r * 4, [[0, 'rgba(255,240,210,0.45)'], [1, 'rgba(255,240,210,0)']]);
    circle(ctx, px, py, r * 4);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    circle(ctx, px, py, r);
    ctx.fill();
  }
  ctx.restore();
}

/** Золотая нить созвездия между картами: мягкие слои и яркая сердцевина. */
function goldThread(ctx: Ctx, pts: [number, number][], width: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [k, a] of [[5, 0.05], [2.4, 0.16], [1, 0.55], [0.42, 1]] as const) {
    ctx.strokeStyle = a > 0.9 ? `rgba(255,246,220,${a})` : `rgba(255,214,140,${a})`;
    ctx.lineWidth = width * k;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
}

/** Настоящая карта игры («Небо масти») с центром (x, y), шириной w, поворотом и свечением. */
function cardAt(ctx: Ctx, card: Face, x: number, y: number, w: number, dpr: number, rot = 0, glow: string | null = null): void {
  const h = w / CARD_ASPECT;
  const img = cardFace(card, round(w), dpr);
  const pad = Math.ceil(round(w) * CARD_PAD) * (w / round(w));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = w * 0.55;
    roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.09);
    ctx.fillStyle = 'rgba(255,220,150,0.35)';
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, -w / 2 - pad, -h / 2 - pad, w + pad * 2, (img.height / img.width) * (w + pad * 2));
  ctx.restore();
}

/** Пустая клетка неба — пунктир, как в игре. */
function slot(ctx: Ctx, x: number, y: number, w: number): void {
  const h = w / CARD_ASPECT;
  ctx.save();
  roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.09);
  ctx.fillStyle = 'rgba(10,10,34,0.35)';
  ctx.fill();
  ctx.setLineDash([w * 0.06, w * 0.07]);
  ctx.lineWidth = max(1, w * 0.014);
  ctx.strokeStyle = 'rgba(200,195,255,0.16)';
  ctx.stroke();
  ctx.restore();
}

// ─── Название ───────────────────────────────────────────────────────────────

/** Название в строки: по-русски два слова — две строки. */
function titleLines(): string[] {
  return t('game.title').toUpperCase().split(' ');
}
/** Строка под названием — по предложениям, каждое своей строкой. */
function taglineLines(): string[] {
  return t('game.tagline').split(/(?<=\.)\s+/);
}

function fitTitle(ctx: Ctx, lines: string[], maxW: number, start: number, spacing: number): number {
  let size = start;
  const widest = () => {
    ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
    ctx.letterSpacing = `${size * spacing}px`;
    return max(...lines.map((l) => ctx.measureText(l).width - size * spacing));
  };
  while (widest() > maxW && size > 10) size *= 0.97;
  ctx.letterSpacing = '0px';
  return size;
}

/** Название цветом логотипа главной: светлое золото → золото, тихое свечение и тень. */
function wordmark(ctx: Ctx, lines: string[], cx: number, y0: number, size: number, spacing: number): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = `${size * spacing}px`;
  lines.forEach((line, i) => {
    const y = y0 + i * size;
    const g = lin(ctx, 0, y - size * 0.75, 0, y + size * 0.05, [[0, '#fff6dc'], [0.6, '#f6c25b'], [1, '#c98a2a']]);
    // letterSpacing добавляет интервал и после последней буквы
    const x = cx + (size * spacing) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(246,194,91,0.5)';
    ctx.shadowBlur = size * 0.3;
    ctx.fillStyle = g;
    ctx.fillText(line, x, y);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.03;
    ctx.fillStyle = g;
    ctx.fillText(line, x, y);
    ctx.restore();
  });
  ctx.restore();
}

/** Название, подоконник с печатью-медальоном и строка тёплым светлым — по центру (cx, cy). */
function titleBlock(ctx: Ctx, cx: number, cy: number, maxW: number, maxSize: number): void {
  const title = titleLines();
  const tag = taglineLines();
  const spacing = 0.12;
  const size = fitTitle(ctx, title, maxW, maxSize, spacing);
  let ts = max(18, min(23, size * 0.33));
  const tagWidth = () => {
    ctx.font = `600 ${ts}px ${BODY_FONT}`;
    return max(...tag.map((l) => ctx.measureText(l).width));
  };
  while (tagWidth() > maxW && ts > 12) ts *= 0.97;
  const tagLH = ts * 1.34;
  const sealR = size * 0.2;
  const gap1 = size * 0.25 + sealR;
  const gap2 = sealR + ts * 1.15;
  const capH = size * 0.7;
  const blockH = capH + (title.length - 1) * size + gap1 + gap2 + (tag.length - 1) * tagLH;
  const base0 = cy - blockH / 2 + capH;
  halo(ctx, cx, cy, maxW * 0.62, [246, 194, 91], 0.07);
  wordmark(ctx, title, cx, base0, size, spacing);
  const sy = base0 + (title.length - 1) * size + gap1;
  sillLine(ctx, cx, sy, min(maxW, size * 4.4), max(1.5, size * 0.028));
  medal(ctx, cx, sy, sealR, { motif: BIG_STAR, s: 27, detail: false });
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${ts}px ${BODY_FONT}`;
  ctx.fillStyle = '#efe2c4';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = ts * 0.5;
  tag.forEach((l, i) => ctx.fillText(l, cx, sy + gap2 + i * tagLH));
  ctx.restore();
}

// ─── Обложка и картинка описания ────────────────────────────────────────────

/**
 * Обложка «Купол» на w×h: слева щель купола — небо с Большой Медведицей и линия-каскад
 * 3·4·5·6 четырёх мастей на золотой нити над подоконником; справа название и печать.
 */
export function drawCover(ctx: Ctx, w: number, h: number, dpr: number): void {
  const sw = h * 0.64;
  const cxs = w * 0.265;
  const x0 = cxs - sw / 2;
  const x1 = x0 + sw;
  const y0 = h * 0.06;
  const yb = h * 0.94;
  domeShell(ctx, w, h, x0, x1, y0, yb);
  halo(ctx, cxs, h * 0.55, sw * 1.05, [120, 90, 255], 0.08);
  slitSky(ctx, x0, x1, y0, yb, 21, 1.3);
  ctx.save();
  slitPath(ctx, x0, x1, y0, yb);
  ctx.clip();
  skyFigure(ctx, x0 + sw * 0.1, y0 + sw * 0.2, sw * 0.8, sw * 0.38);
  const cw = h * 0.13;
  const cards: Face[] = [{ suit: 'moon', rank: 3 }, { suit: 'sun', rank: 4 }, { suit: 'star', rank: 5 }, { suit: 'comet', rank: 6 }];
  const P = cards.map((c, i) => {
    const k = (i - 1.5) / 1.5;
    return { x: cxs + k * sw * 0.355, y: yb - h * 0.2 - (1 - k * k) * h * 0.07, c, rot: k * 0.16 };
  });
  halo(ctx, cxs, yb - h * 0.22, sw * 0.55, [255, 200, 120], 0.16);
  goldThread(ctx, P.map((p) => [p.x, p.y]), cw * 0.07);
  for (const p of P) cardAt(ctx, p.c, p.x, p.y, cw, dpr, p.rot, 'rgba(255,214,140,0.75)');
  ctx.restore();
  slitRim(ctx, x0, x1, y0, yb, max(2, h * 0.009));
  sillLine(ctx, cxs, yb, sw * 1.55, max(2, h * 0.006));
  titleBlock(ctx, w * 0.715, h * 0.5, w * 0.47, h * 0.2);
}

/**
 * Картинка описания бота на w×h (без текста, одна на оба языка): вся щель купола, в ней небо
 * 4×4 и крест — ряд-каскад и столбец-флеш горят через общую карту.
 */
export function drawDescription(ctx: Ctx, w: number, h: number, dpr: number): void {
  const sw = w * 0.58;
  const x0 = (w - sw) / 2;
  const x1 = x0 + sw;
  const y0 = h * 0.04;
  const yb = h * 0.94;
  domeShell(ctx, w, h, x0, x1, y0, yb);
  halo(ctx, w / 2, h * 0.55, sw * 0.9, [120, 90, 255], 0.08);
  slitSky(ctx, x0, x1, y0, yb, 33, 1.6);
  ctx.save();
  slitPath(ctx, x0, x1, y0, yb);
  ctx.clip();
  const k = h / 360;
  const cw = 42 * k;
  const ch = cw / CARD_ASPECT;
  const gap = 7 * k;
  const gx = w / 2 - (cw * 4 + gap * 3) / 2 + cw / 2;
  const gy = yb - 10 * k - (ch * 4 + gap * 3) + ch / 2;
  const at = (c: number, r: number): [number, number] => [gx + c * (cw + gap), gy + r * (ch + gap)];
  const row = 2;
  const col = 1;
  const R: Face[] = [{ suit: 'moon', rank: 3 }, { suit: 'sun', rank: 4 }, { suit: 'star', rank: 5 }, { suit: 'comet', rank: 6 }];
  const C: (Face | null)[] = [{ suit: 'sun', rank: 8 }, { suit: 'sun', rank: 2 }, null, { suit: 'sun', rank: 7 }];
  const other: Record<string, Face> = { '0,0': { suit: 'star', rank: 1 }, '3,0': { suit: 'moon', rank: 9 }, '2,1': { suit: 'comet', rank: 2 }, '3,3': { suit: 'star', rank: 6 } };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (r === row || c === col) continue;
      const [x, y] = at(c, r);
      const o = other[`${c},${r}`];
      if (o) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        cardAt(ctx, o, x, y, cw, dpr);
        ctx.restore();
      } else slot(ctx, x, y, cw);
    }
  }
  const [ix, iy] = at(col, row);
  halo(ctx, ix, iy, cw * 3.2, [255, 214, 140], 0.32);
  goldThread(ctx, [0, 1, 2, 3].map((c) => at(c, row)), cw * 0.08);
  goldThread(ctx, [0, 1, 2, 3].map((r) => at(col, r)), cw * 0.08);
  for (let c = 0; c < 4; c++) cardAt(ctx, R[c]!, ...at(c, row), cw, dpr, 0, 'rgba(255,214,140,0.8)');
  for (let r = 0; r < 4; r++) if (C[r]) cardAt(ctx, C[r]!, ...at(col, r), cw, dpr, 0, 'rgba(255,214,140,0.8)');
  // Вспышка в общей карте — момент креста
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rad(ctx, ix, iy, 0, ix, iy, cw * 0.9, [[0, 'rgba(255,250,235,0.55)'], [1, 'rgba(255,230,170,0)']]);
  circle(ctx, ix, iy, cw * 0.9);
  ctx.fill();
  ctx.restore();
  ctx.restore();
  slitRim(ctx, x0, x1, y0, yb, max(2, h * 0.009));
  sillLine(ctx, w / 2, yb, sw * 1.4, max(2, h * 0.006));
}
