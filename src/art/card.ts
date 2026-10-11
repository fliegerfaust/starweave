import type { Card, Glyph, Suit } from '@/core/types';
import { makeCanvas } from '@/engine/renderer';
import { glowDot, roundRect, sparklePath, suitPath } from './glyphs';
import { DISPLAY_FONT, SUIT_COLORS, rgba } from './palette';

/** Пропорции карты: ширина / высота. */
export const CARD_ASPECT = 0.7;

type Pt = [number, number];

/**
 * Ранги нарисованы как созвездия: число звёзд = ранг, рёбра соединяют их в фигуру.
 * Координаты в квадрате [-1, 1]. Семёрка — Большой Ковш, пятёрка — Кассиопея,
 * девятка — Орион.
 */
const CONSTELLATIONS: Record<number, { stars: Pt[]; edges: [number, number][] }> = {
  1: { stars: [[0, 0]], edges: [] },
  2: { stars: [[-0.45, 0.45], [0.45, -0.45]], edges: [[0, 1]] },
  3: { stars: [[-0.6, 0.5], [0.05, -0.6], [0.6, 0.45]], edges: [[0, 1], [1, 2], [2, 0]] },
  4: {
    stars: [[-0.55, -0.45], [0.5, -0.6], [0.6, 0.5], [-0.45, 0.6]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  5: {
    stars: [[-0.85, -0.3], [-0.42, 0.42], [0, -0.1], [0.42, 0.45], [0.85, -0.38]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  6: {
    stars: [[-0.75, -0.55], [-0.2, -0.35], [0.35, -0.6], [0.75, -0.05], [0.4, 0.55], [-0.35, 0.6]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
  },
  7: {
    stars: [[-0.9, -0.6], [-0.55, -0.42], [-0.22, -0.25], [0.1, -0.05], [0.2, 0.55], [0.85, 0.5], [0.78, -0.08]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  8: {
    stars: [[-0.7, -0.72], [0, -0.85], [0.72, -0.6], [0.48, 0], [0.75, 0.68], [0, 0.82], [-0.65, 0.6], [-0.45, -0.02]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]],
  },
  9: {
    stars: [[0, -0.92], [-0.5, -0.55], [0.52, -0.6], [-0.22, 0.02], [0, 0.07], [0.22, 0.12], [-0.55, 0.8], [0.6, 0.75], [0.04, 0.48]],
    edges: [[0, 1], [0, 2], [1, 3], [2, 5], [3, 4], [4, 5], [3, 6], [5, 7], [4, 8]],
  },
};

const GLYPH_COLORS: Record<Glyph, [number, number, number]> = {
  gilded: [255, 214, 102],
  blazing: [255, 110, 64],
  radiant: [127, 224, 255],
  echo: [190, 160, 255],
  glass: [200, 240, 255],
  prism: [255, 255, 255],
};

export interface CardArtOptions {
  /** Ранг скрыт (Затмение «Туман»). */
  hideRank?: boolean;
}

const cache = new Map<string, HTMLCanvasElement>();

export function clearCardCache(): void {
  cache.clear();
}

/** Лицо карты, нарисованное в `w`×`h` CSS-пикселей с масштабом `scale` (DPR). */
export function cardFace(card: Pick<Card, 'suit' | 'rank' | 'glyph'>, w: number, scale: number, opts: CardArtOptions = {}): HTMLCanvasElement {
  const h = Math.round(w / CARD_ASPECT);
  const key = `f:${card.suit}:${card.rank}:${card.glyph ?? ''}:${opts.hideRank ? 1 : 0}:${w}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pad = Math.ceil(w * 0.12);
  const canvas = makeCanvas(w + pad * 2, h + pad * 2, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(pad, pad);
  drawFace(ctx, card, w, h, opts);
  cache.set(key, canvas);
  return canvas;
}

/** Отступ вокруг карты в кэшированном канвасе (для свечения), в долях ширины. */
export const CARD_PAD = 0.12;

function drawFace(ctx: CanvasRenderingContext2D, card: Pick<Card, 'suit' | 'rank' | 'glyph'>, w: number, h: number, opts: CardArtOptions): void {
  const col = SUIT_COLORS[card.suit];
  const r = w * 0.09;
  const glyphRgb = card.glyph ? GLYPH_COLORS[card.glyph] : null;

  // Внешнее свечение
  ctx.save();
  ctx.shadowColor = rgba(glyphRgb ?? col.rgb, card.glyph ? 0.75 : 0.35);
  ctx.shadowBlur = w * (card.glyph ? 0.16 : 0.08);
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = '#0d0c25';
  ctx.fill();
  ctx.restore();

  // Основа: вертикальный градиент ночи с оттенком масти
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, mix('#1f1c48', col.deep, 0.35));
  bg.addColorStop(1, '#0a0a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const halo = ctx.createRadialGradient(w / 2, h * 0.56, 0, w / 2, h * 0.56, w * 0.75);
  halo.addColorStop(0, rgba(col.rgb, 0.28));
  halo.addColorStop(1, rgba(col.rgb, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // Пыль звёзд — детерминированная по карте
  const seed = card.rank * 31 + card.suit.length * 7 + card.suit.charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    const px = frac(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) * w;
    const py = frac(Math.sin(seed * 4.1414 + i * 12.345) * 24634.6345) * h;
    const a = 0.15 + frac(i * 0.618) * 0.35;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(px, py, w * 0.008, w * 0.008);
  }

  if (card.glyph) drawGlyphBackdrop(ctx, card.glyph, w, h);

  // Призрачный символ масти
  ctx.globalAlpha = 0.13;
  suitPath(ctx, card.suit, w / 2, h * 0.57, w * 0.36);
  ctx.fillStyle = col.main;
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;

  // Созвездие ранга
  if (!opts.hideRank) drawConstellation(ctx, card.rank, card.suit, w / 2, h * 0.585, w * 0.3, h * 0.25);
  else drawFogMark(ctx, w, h, col.rgb);
  ctx.restore();

  // Рамка
  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, r);
  ctx.lineWidth = Math.max(1, w * 0.018);
  ctx.strokeStyle = card.glyph === 'prism' ? prismStroke(ctx, w, h) : rgba(glyphRgb ?? col.rgb, 0.95);
  ctx.stroke();
  roundRect(ctx, w * 0.05, w * 0.05, w * 0.9, h - w * 0.1, r * 0.6);
  ctx.lineWidth = Math.max(0.5, w * 0.006);
  ctx.strokeStyle = rgba(col.rgb, 0.35);
  ctx.stroke();
  if (card.glyph === 'echo') {
    roundRect(ctx, w * 0.085, w * 0.085, w * 0.83, h - w * 0.17, r * 0.5);
    ctx.strokeStyle = rgba(GLYPH_COLORS.echo, 0.6);
    ctx.stroke();
  }
  ctx.restore();

  // Ранг в углу
  const fs = w * 0.4;
  ctx.save();
  ctx.font = `400 ${fs}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = rgba(col.rgb, 0.9);
  ctx.shadowBlur = w * 0.08;
  ctx.fillStyle = col.light;
  const rankText = opts.hideRank ? '?' : String(card.rank);
  ctx.fillText(rankText, w * 0.21, w * 0.43);
  ctx.restore();

  // Масть под рангом
  ctx.save();
  suitPath(ctx, card.suit, w * 0.21, w * 0.57, w * 0.085);
  ctx.fillStyle = col.main;
  ctx.shadowColor = rgba(col.rgb, 0.8);
  ctx.shadowBlur = w * 0.04;
  ctx.fill('evenodd');
  ctx.restore();

  // Маленькая масть в правом нижнем углу
  ctx.save();
  ctx.globalAlpha = 0.75;
  suitPath(ctx, card.suit, w * 0.84, h - w * 0.16, w * 0.06);
  ctx.fillStyle = col.main;
  ctx.fill('evenodd');
  ctx.restore();

  if (card.glyph) drawGlyphBadge(ctx, card.glyph, w * 0.82, w * 0.18, w * 0.09);
}

function drawConstellation(ctx: CanvasRenderingContext2D, rank: number, suit: Suit, cx: number, cy: number, sx: number, sy: number): void {
  const pattern = CONSTELLATIONS[rank] ?? CONSTELLATIONS[1]!;
  const col = SUIT_COLORS[suit];
  const pts = pattern.stars.map(([x, y]) => [cx + x * sx, cy + y * sy] as Pt);
  ctx.save();
  ctx.lineWidth = Math.max(0.6, sx * 0.025);
  ctx.strokeStyle = rgba(col.rgb, 0.55);
  ctx.lineCap = 'round';
  for (const [a, b] of pattern.edges) {
    const pa = pts[a]!;
    const pb = pts[b]!;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
  const dot = Math.max(1.2, sx * (rank === 1 ? 0.12 : 0.055));
  pts.forEach(([x, y], i) => {
    const big = i === 0 || rank === 1;
    glowDot(ctx, x, y, big ? dot * 1.25 : dot, rgba(col.rgb, 0.9), col.light);
  });
  if (rank === 1) {
    ctx.fillStyle = rgba(col.rgb, 0.6);
    sparklePath(ctx, cx, cy, sx * 0.55, 4, 0.12);
    ctx.fill();
  }
  ctx.restore();
}

function drawFogMark(ctx: CanvasRenderingContext2D, w: number, h: number, rgb: [number, number, number]): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.58, 0, w / 2, h * 0.58, w * 0.5);
  g.addColorStop(0, 'rgba(200,200,230,0.35)');
  g.addColorStop(1, 'rgba(200,200,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(rgb, 0.5);
  ctx.font = `400 ${w * 0.5}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', w / 2, h * 0.6);
}

function drawGlyphBackdrop(ctx: CanvasRenderingContext2D, glyph: Glyph, w: number, h: number): void {
  const rgb = GLYPH_COLORS[glyph];
  switch (glyph) {
    case 'gilded': {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, rgba(rgb, 0.25));
      g.addColorStop(0.5, rgba(rgb, 0.05));
      g.addColorStop(1, rgba(rgb, 0.22));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'blazing': {
      const g = ctx.createLinearGradient(0, h, 0, h * 0.4);
      g.addColorStop(0, rgba(rgb, 0.55));
      g.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'radiant': {
      ctx.save();
      ctx.translate(w / 2, h * 0.58);
      for (let i = 0; i < 16; i++) {
        ctx.rotate(Math.PI / 8);
        ctx.fillStyle = rgba(rgb, i % 2 ? 0.08 : 0.14);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-w * 0.08, -h);
        ctx.lineTo(w * 0.08, -h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'glass': {
      ctx.fillStyle = 'rgba(200,240,255,0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(w * 0.1, 0);
      ctx.lineTo(w * 0.45, 0);
      ctx.lineTo(0, h * 0.5);
      ctx.lineTo(0, h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w, h * 0.55);
      ctx.lineTo(w, h * 0.7);
      ctx.lineTo(w * 0.6, h);
      ctx.lineTo(w * 0.45, h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'prism': {
      const g = ctx.createLinearGradient(0, 0, w, h);
      ['#ff6b8b', '#ffd36b', '#7cf0b0', '#7fe0ff', '#c39bff'].forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      break;
    }
    case 'echo': {
      ctx.strokeStyle = rgba(rgb, 0.18);
      ctx.lineWidth = w * 0.01;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.58, w * 0.12 * i, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }
}

/** Маленький значок глифа — тот же рисунок используется в интерфейсе. */
export function drawGlyphBadge(ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, r: number): void {
  const rgb = GLYPH_COLORS[glyph];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,8,24,0.85)';
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = rgba(rgb, 0.95);
  ctx.stroke();
  ctx.fillStyle = rgba(rgb, 1);
  ctx.strokeStyle = rgba(rgb, 1);
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.55;
  switch (glyph) {
    case 'gilded':
      ctx.beginPath();
      ctx.arc(x, y, s * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(8,8,24,0.6)';
      ctx.fillRect(x - s * 0.1, y - s * 0.45, s * 0.2, s * 0.9);
      break;
    case 'blazing':
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.quadraticCurveTo(x + s, y, x, y + s);
      ctx.quadraticCurveTo(x - s, y, x, y - s);
      ctx.fill();
      break;
    case 'radiant':
      ctx.beginPath();
      sparklePath(ctx, x, y, s * 1.1, 8, 0.4);
      ctx.fill();
      break;
    case 'echo':
      ctx.beginPath();
      ctx.arc(x, y, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, s * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'glass':
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.8, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s * 0.8, y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y);
      ctx.lineTo(x + s * 0.8, y);
      ctx.stroke();
      break;
    case 'prism': {
      const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
      ['#ff6b8b', '#ffd36b', '#7cf0b0', '#7fe0ff', '#c39bff'].forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.9, y + s * 0.7);
      ctx.lineTo(x - s * 0.9, y + s * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Рубашка: фиолетовая мандала из звёздных линий. */
export function cardBack(w: number, scale: number): HTMLCanvasElement {
  const key = `b:${w}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = Math.round(w / CARD_ASPECT);
  const pad = Math.ceil(w * CARD_PAD);
  const canvas = makeCanvas(w + pad * 2, h + pad * 2, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(pad, pad);
  const r = w * 0.09;
  ctx.save();
  ctx.shadowColor = 'rgba(160,120,255,0.4)';
  ctx.shadowBlur = w * 0.08;
  roundRect(ctx, 0, 0, w, h, r);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a1a5e');
  g.addColorStop(1, '#100b2c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.translate(w / 2, h / 2);
  ctx.strokeStyle = 'rgba(246,194,91,0.45)';
  ctx.lineWidth = Math.max(0.6, w * 0.008);
  for (let ring = 1; ring <= 3; ring++) {
    const rr = w * 0.13 * ring;
    const n = 4 + ring * 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const p = [Math.cos(a) * rr, Math.sin(a) * rr];
      if (i === 0) ctx.moveTo(p[0]!, p[1]!);
      else ctx.lineTo(p[0]!, p[1]!);
    }
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      glowDot(ctx, Math.cos(a) * rr, Math.sin(a) * rr, w * 0.012, 'rgba(246,194,91,0.9)', '#fff4d6');
    }
  }
  ctx.fillStyle = 'rgba(246,194,91,0.85)';
  sparklePath(ctx, 0, 0, w * 0.1, 4, 0.2);
  ctx.fill();
  ctx.restore();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, r);
  ctx.lineWidth = Math.max(1, w * 0.018);
  ctx.strokeStyle = 'rgba(246,194,91,0.8)';
  ctx.stroke();
  cache.set(key, canvas);
  return canvas;
}

function prismStroke(ctx: CanvasRenderingContext2D, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, w, h);
  ['#ff6b8b', '#ffd36b', '#7cf0b0', '#7fe0ff', '#c39bff'].forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
  return g;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(',')})`;
}

function hex(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
