import type { Card, Glyph } from '@/core/types';
import { BODY_COLORS, drawBodyWindow } from './bodies';
import { makeCanvas } from '@/engine/renderer';
import { SpriteCache } from './sprite-cache';
import { roundRect, sparklePath, suitPath } from './glyphs';
import { drawEngravedBack } from './backs';
import { DEFAULT_BACK, backStyle } from './cosmetics';
import { BODY_FONT, SUIT_COLORS, SUIT_FIELDS, rgba } from './palette';

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

/** Лица и рубашки: на ночь хватает десятков, потолок — с запасом на атлас и смену размера. */
const cache = new SpriteCache(160);

export function clearCardCache(): void {
  cache.clear();
}

/** Лицо карты, нарисованное в `w`×`h` CSS-пикселей с масштабом `scale` (DPR). */
export function cardFace(card: Pick<Card, 'suit' | 'rank' | 'glyph' | 'body'>, w: number, scale: number, opts: CardArtOptions = {}): HTMLCanvasElement {
  const h = Math.round(w / CARD_ASPECT);
  const key = `f:${card.suit}:${card.rank}:${card.glyph ?? ''}:${card.body ?? ''}:${opts.hideRank ? 1 : 0}:${w}:${scale}`;
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

/**
 * «Небо масти» (FP.3, выбор Дениса): масть — цветом всего поля и крупной эмблемой, ранг —
 * белой костью в углу (одинаков для всех мастей, самый высокий контраст), созвездие ранга —
 * маленькой гравировкой в свободном углу, кромка — золочёная. На мелких картах (< 62 px)
 * пыль, внутренняя линия и созвездие не рисуются — остаются цифра и эмблема.
 */
function drawFace(ctx: CanvasRenderingContext2D, card: Pick<Card, 'suit' | 'rank' | 'glyph' | 'body'>, w: number, h: number, opts: CardArtOptions): void {
  const col = SUIT_COLORS[card.suit];
  // Небесное тело (GF.4): поле масти, окно с телом вместо эмблемы, кромка цвета тела
  const bodyRgb = card.body ? BODY_COLORS[card.body] : null;
  const glow = bodyRgb ?? (card.glyph ? GLYPH_COLORS[card.glyph] : null);
  const field = SUIT_FIELDS[card.suit];
  const r = w * 0.09;
  const small = w < 62;
  const { x: ex, y: ey, r: er } = suitEmblem(w, h);

  // Тень под картой — карта лежит на небе, а не светится
  ctx.save();
  ctx.shadowColor = glow ? rgba(glow, 0.6) : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = w * (glow ? 0.14 : 0.08);
  ctx.shadowOffsetY = glow ? 0 : w * 0.025;
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = field[1];
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, field[0]);
  bg.addColorStop(1, field[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // Тёплый блик сверху слева и ореол под эмблемой
  const tl = ctx.createRadialGradient(w * 0.3, 0, 0, w * 0.3, 0, w * 1.05);
  tl.addColorStop(0, 'rgba(255,244,220,0.12)');
  tl.addColorStop(1, 'rgba(255,244,220,0)');
  ctx.fillStyle = tl;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, er * 1.9);
  halo.addColorStop(0, rgba(col.rgb, 0.32));
  halo.addColorStop(1, rgba(col.rgb, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  if (!small) {
    // Пыль звёзд — детерминированная по карте
    const seed = card.rank * 31 + card.suit.length * 7 + card.suit.charCodeAt(0);
    const dot = Math.max(0.6, w * 0.008);
    for (let i = 0; i < 12; i++) {
      const px = frac(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) * w;
      const py = frac(Math.sin(seed * 4.1414 + i * 12.345) * 24634.6345) * h;
      ctx.fillStyle = `rgba(255,255,255,${(0.12 + frac(i * 0.618) * 0.3) * 0.6})`;
      ctx.fillRect(px, py, dot, dot);
    }
  }
  if (card.glyph) {
    ctx.globalAlpha = 0.7;
    drawGlyphBackdrop(ctx, card.glyph, w, h);
    ctx.globalAlpha = 1;
  }

  if (card.body) {
    drawBodyWindow(ctx, card.body, w * 0.56, ey, er * 1.12);
    // Масть — маленьким знаком в углу, где у простой карты созвездие ранга
    drawSuitMark(ctx, card.suit, w * 0.78, w * 0.24, w * 0.12);
  } else {
    // Эмблема масти
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = w * 0.06;
    ctx.shadowOffsetY = w * 0.02;
    suitPath(ctx, card.suit, ex, ey, er);
    const eg = ctx.createLinearGradient(0, ey - er, 0, ey + er);
    eg.addColorStop(0, col.light);
    eg.addColorStop(1, col.main);
    ctx.fillStyle = eg;
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Созвездие ранга — гравировкой в свободном углу (глиф и масть тела занимают тот же угол)
  if (!small && !card.glyph && !card.body && !opts.hideRank) drawConstellation(ctx, card.rank, w * 0.74, w * 0.3, w * 0.15);
  ctx.restore();

  // Золочёная кромка; у карт с глифом — цветом глифа
  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, r);
  ctx.lineWidth = Math.max(1.2, w * 0.022);
  ctx.strokeStyle = card.glyph === 'prism' ? prismStroke(ctx, w, h) : glow ? rgba(glow, 0.9) : gildedStroke(ctx, w, h);
  ctx.stroke();
  if (!small) {
    roundRect(ctx, w * 0.055, w * 0.055, w * 0.89, h - w * 0.11, r * 0.55);
    ctx.lineWidth = Math.max(0.6, w * (bodyRgb ? 0.012 : 0.007));
    ctx.strokeStyle = bodyRgb ? rgba(bodyRgb, 0.45) : card.glyph === 'echo' ? rgba(GLYPH_COLORS.echo, 0.6) : 'rgba(255,240,210,0.2)';
    ctx.stroke();
  }
  ctx.restore();

  // Ранг в углу: Manrope 800 цвета кости, по центру видимых границ цифры
  ctx.save();
  ctx.font = `800 ${w * 0.49}px ${BODY_FONT}`;
  ctx.fillStyle = opts.hideRank ? 'rgba(255,248,234,0.55)' : '#fff8ea';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = w * 0.05;
  ctx.shadowOffsetY = w * 0.012;
  const rankText = opts.hideRank ? '?' : String(card.rank);
  if (card.body === 'nebula' && !opts.hideRank) {
    // Туманность встаёт любым рангом — вместо цифры «1–9»
    ctx.font = `800 ${w * 0.25}px ${BODY_FONT}`;
    centeredText(ctx, '1–9', w * 0.3, w * 0.3);
    ctx.shadowColor = 'transparent';
    centeredText(ctx, '1–9', w * 0.3, w * 0.3);
    ctx.restore();
  } else {
    centeredText(ctx, rankText, w * 0.255, w * 0.33);
    // Чёткий слой поверх тени: Safari растягивает shadowBlur вместе с масштабом холста
    ctx.shadowColor = 'transparent';
    centeredText(ctx, rankText, w * 0.255, w * 0.33);
    // Двойник: второй ранг маленькой цифрой цвета тела под своим
    if (card.body === 'twin' && !opts.hideRank && card.rank < 9) {
      ctx.font = `800 ${w * 0.2}px ${BODY_FONT}`;
      ctx.fillStyle = rgba(BODY_COLORS.twin, 1);
      centeredText(ctx, `+${card.rank + 1}`, w * 0.235, w * 0.64);
    }
    ctx.restore();
  }

  if (card.glyph) drawGlyphBadge(ctx, card.glyph, w * 0.79, w * 0.2, w * 0.105);
}

/** Маленький знак масти цветом масти — у тела, чья эмблема занята окном. */
function drawSuitMark(ctx: CanvasRenderingContext2D, suit: Card['suit'], x: number, y: number, r: number): void {
  const col = SUIT_COLORS[suit];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = r * 0.4;
  suitPath(ctx, suit, x, y, r);
  ctx.fillStyle = col.light;
  ctx.fill('evenodd');
  ctx.restore();
}

/** Где на лице карты эмблема масти — туда же Затмение ставит свой диск. */
export function suitEmblem(w: number, h: number): { x: number; y: number; r: number } {
  return { x: w * 0.62, y: h * 0.665, r: w * 0.27 };
}

/** Текст с центром по видимым границам знаков — цифры встают ровно в точку. */
function centeredText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const x = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 + m.actualBoundingBoxLeft;
  const y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillText(text, x, y);
}

function gildedStroke(ctx: CanvasRenderingContext2D, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ffe6a8');
  g.addColorStop(0.45, '#c8912f');
  g.addColorStop(0.7, '#f6c25b');
  g.addColorStop(1, '#9a6a22');
  return g;
}

/** Созвездие ранга маленькой гравировкой цвета кости. */
function drawConstellation(ctx: CanvasRenderingContext2D, rank: number, cx: number, cy: number, sx: number): void {
  const pattern = CONSTELLATIONS[rank] ?? CONSTELLATIONS[1]!;
  const ink: [number, number, number] = [255, 246, 228];
  const pts = pattern.stars.map(([x, y]) => [cx + x * sx, cy + y * sx] as Pt);
  ctx.save();
  ctx.lineWidth = Math.max(0.7, sx * 0.04);
  ctx.strokeStyle = rgba(ink, 0.35);
  ctx.lineCap = 'round';
  for (const [a, b] of pattern.edges) {
    const pa = pts[a]!;
    const pb = pts[b]!;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
  const dot = Math.max(0.9, sx * (rank === 1 ? 0.13 : 0.08));
  pts.forEach(([x, y], i) => {
    const d = i === 0 && rank > 1 ? dot * 1.2 : dot;
    const g = ctx.createRadialGradient(x, y, 0, x, y, d * 3.2);
    g.addColorStop(0, rgba(ink, 0.35));
    g.addColorStop(1, rgba(ink, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, d * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff8ea';
    ctx.beginPath();
    ctx.arc(x, y, d, 0, Math.PI * 2);
    ctx.fill();
  });
  if (rank === 1) {
    ctx.fillStyle = rgba(ink, 0.55);
    ctx.beginPath();
    sparklePath(ctx, cx, cy, sx * 0.6, 4, 0.12);
    ctx.fill();
  }
  ctx.restore();
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

let activeBack = DEFAULT_BACK;

/** Рубашка карт в игре (выбирается в атласе). */
export function setCardBack(id: string): void {
  activeBack = backStyle(id).id;
}

/** Рубашка — «Гравюра» (см. backs.ts). */
export function cardBack(w: number, scale: number, styleId = activeBack): HTMLCanvasElement {
  const style = backStyle(styleId);
  const key = `b:${style.id}:${w}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = Math.round(w / CARD_ASPECT);
  const pad = Math.ceil(w * CARD_PAD);
  const canvas = makeCanvas(w + pad * 2, h + pad * 2, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(pad, pad);
  drawEngravedBack(ctx, style, w, h);
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
