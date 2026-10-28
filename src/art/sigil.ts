import { omenDef } from '@/core/content/omens';
import type { ComboId, Glyph } from '@/core/types';
import { keepPainted } from '@/engine/canvas-life';
import { makeCanvas } from '@/engine/renderer';
import { SpriteCache } from './sprite-cache';
import { drawGlyphBadge } from './card';
import { drawComboScheme, drawEnamelBoss, drawEnamelChart, drawEnamelFeat, drawEnamelMark, drawEnamelOmen, drawEnamelPack, drawEnamelRitual } from './enamel';

type Ctx = CanvasRenderingContext2D;

const cache = new SpriteCache(160);

/** Холст из кэша или новый, нарисованный `draw` в CSS-пикселях. */
function cached(key: string, w: number, h: number, scale: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const paint = (c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    draw(ctx);
  };
  const canvas = keepPainted(makeCanvas(w, h, scale), paint);
  paint(canvas);
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

/** Медальон достижения «Зала славы»: розетка ордена, ступень — бусины и звезда. */
export function featSigil(motif: string, fam: string, tier: 0 | 1 | 2 | 3, size: number, scale: number): HTMLCanvasElement {
  return cached(`feat:${motif}:${fam}:${tier}:${size}:${scale}`, size, size, scale, (ctx) => drawEnamelFeat(ctx, motif, fam, tier, size));
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

/** Пакет: латунный конверт на эмали цвета содержимого, печать со знаком (см. enamel.ts). */
export function packIcon(pack: string, size: number, scale: number): HTMLCanvasElement {
  return cached(`pack:${pack}:${size}:${scale}`, size, size, scale, (ctx) => drawEnamelPack(ctx, pack, size));
}

/** Знак покупки в списке «Что внутри» (без рекламы) — медальон «Эмали». */
export function markIcon(id: string, size: number, scale: number): HTMLCanvasElement {
  return cached(`mark:${id}:${size}:${scale}`, size, size, scale, (ctx) => drawEnamelMark(ctx, id, size));
}

export function clearSigilCache(): void {
  cache.clear();
}
