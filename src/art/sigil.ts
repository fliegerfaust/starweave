import { omenDef } from '@/core/content/omens';
import type { ComboId, Glyph } from '@/core/types';
import { makeCanvas } from '@/engine/renderer';
import { drawGlyphBadge } from './card';
import { drawComboScheme, drawEnamelBoss, drawEnamelChart, drawEnamelOmen, drawEnamelRitual } from './enamel';
import { glowDot, roundRect, sparklePath } from './glyphs';
import { rgba } from './palette';

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, HTMLCanvasElement>();

/** Холст из кэша или новый, нарисованный `draw` в CSS-пикселях. */
function cached(key: string, w: number, h: number, scale: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(w, h, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  draw(ctx);
  cache.set(key, canvas);
  return canvas;
}

/** Медальон Знамения — «Эмаль» (см. enamel.ts). */
export function omenSigil(id: string, size: number, scale: number): HTMLCanvasElement {
  return cached(`o:${id}:${size}:${scale}`, size, size, scale, (ctx) => {
    const def = omenDef(id);
    drawEnamelOmen(ctx, id, def.rarity, def.kind, size);
  });
}

/** Затмение: жемчужная оправа, чёрная эмаль, знак правила. */
export function bossSigil(id: string, size: number, scale: number): HTMLCanvasElement {
  return cached(`boss:${id}:${size}:${scale}`, size, size, scale, (ctx) => drawEnamelBoss(ctx, id, size));
}

/** Иконка Звёздной карты (прокачка созвездия): схема созвездия на лазурите. */
export function chartIcon(combo: ComboId, size: number, scale: number): HTMLCanvasElement {
  return cached(`chart:${combo}:${size}:${scale}`, size, size, scale, (ctx) => drawEnamelChart(ctx, combo, size));
}

/** Схема созвездия для строки Справочника, ширина `w`. */
export function comboScheme(combo: ComboId, w: number, scale: number): HTMLCanvasElement {
  const h = Math.round((w * 68) / 116);
  return cached(`scheme:${combo}:${w}:${scale}`, w, h, scale, (ctx) => drawComboScheme(ctx, combo, w));
}

/** Иконка ритуала: карта в латунной рамке; у ритуала глифа — его значок. */
export function ritualIcon(id: string, size: number, scale: number): HTMLCanvasElement {
  return cached(`rit:${id}:${size}:${scale}`, size, size, scale, (ctx) => {
    const [kind, arg] = id.split('-') as [string, string | undefined];
    const glyph = kind === 'glyph' && arg ? (arg as Glyph) : null;
    drawEnamelRitual(ctx, id, size, glyph ? (c) => drawGlyphBadge(c, glyph, 0, 0, 17) : undefined);
  });
}

const PACK_COLORS: Record<string, [number, number, number]> = {
  omen: [159, 184, 255],
  ritual: [255, 107, 139],
  chart: [127, 224, 255],
};

/** Пакет: запечатанный конверт со звёздной печатью цвета содержимого. */
export function packIcon(pack: string, size: number, scale: number): HTMLCanvasElement {
  const key = `pack:${pack}:${size}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rgb = PACK_COLORS[pack] ?? [246, 194, 91];
  const canvas = makeCanvas(size, size, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const w = size * 0.78;
  const h = size * 0.58;
  const x = (size - w) / 2;
  const y = (size - h) / 2 + size * 0.04;
  ctx.shadowColor = rgba(rgb, 0.6);
  ctx.shadowBlur = size * 0.1;
  roundRect(ctx, x, y, w, h, size * 0.06);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2c2766');
  g.addColorStop(1, '#100e2c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(rgb, 0.9);
  ctx.lineWidth = size * 0.02;
  ctx.stroke();
  // клапан конверта
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.02);
  ctx.lineTo(size / 2, y + h * 0.58);
  ctx.lineTo(x + w, y + size * 0.02);
  ctx.strokeStyle = rgba(rgb, 0.55);
  ctx.stroke();
  // три звезды-карты внутри
  for (let i = -1; i <= 1; i++) glowDot(ctx, size / 2 + i * w * 0.25, y + h * 0.82, size * 0.014, rgba(rgb, 0.9));
  // печать
  ctx.beginPath();
  ctx.arc(size / 2, y + h * 0.58, size * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = rgba(rgb, 1);
  ctx.shadowColor = rgba(rgb, 0.9);
  ctx.shadowBlur = size * 0.08;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#120f30';
  ctx.beginPath();
  sparklePath(ctx, size / 2, y + h * 0.58, size * 0.075, 4, 0.3);
  ctx.fill();
  cache.set(key, canvas);
  return canvas;
}

export function clearSigilCache(): void {
  cache.clear();
}
