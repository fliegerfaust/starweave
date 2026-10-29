import { COMBO_EXAMPLES } from '@/core/content/combos';
import type { ComboId, Suit } from '@/core/types';
import { FAM, SUIT_PAINT, brassBezel, mix, path, roundedRect, sparkle, stage, stops } from './enamel';

/**
 * Витрина CN.1: три варианта иконки созвездия. Знак у всех один и тот же — фигура,
 * которая показывает правило: пара — двойная звезда, тройка — треугольник, каре — ромб,
 * стрит — лесенка, каскад — ровная диагональ, одна масть — звёзды одного цвета.
 *
 * A «Эмаль» — латунная плашка, цвет эмали растёт с силой созвездия.
 * B «Карты» — четыре карты линии 2×2 с рангами, совпавшие подсвечены.
 * C «Без рамки» — фигура светится прямо на небе, без плашки.
 */
export type ChartStyle = 'a' | 'b' | 'c';

type Ctx = CanvasRenderingContext2D;

const { PI, cos, sin } = Math;

interface Star {
  x: number;
  y: number;
  su: Suit;
  /** Размер: 1 — обычная звезда созвездия. */
  r: number;
  dim?: boolean;
}

interface Fig {
  stars: Star[];
  /** Линии фигуры (SVG-пути в квадрате [-50, 50]). */
  links: string[];
  /** Ореол масти за фигурой: «одна масть». */
  glow?: Suit;
  /** Вспышка за звездой с этим номером: Сверхновая. */
  burst?: number;
}

const s = (x: number, y: number, su: Suit, r = 1, dim = false): Star => ({ x, y, su, r, dim });
const seg = (a: Star, b: Star) => `M${a.x} ${a.y}L${b.x} ${b.y}`;
const poly = (p: Star[], closed = false) => 'M' + p.map((q) => `${q.x} ${q.y}`).join('L') + (closed ? 'Z' : '');
const bow = (a: Star, b: Star, lift: number) => `M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - lift} ${b.x} ${b.y}`;

/** Ступени лесенки: верх каждой — под своей звездой. */
const STEPS = 'M-33 28H-16V15H1V2H16V-11H33';
/** Стрелка «по порядку» после последней звезды каскада. */
const ARROW = 'M26 -32L35 -33L34 -24';
const stairStars = (su: Suit[]) => [s(-23.5, 16, su[0]!, 0.85), s(-7.5, 3, su[1]!, 0.85), s(7.5, -10, su[2]!, 0.85), s(23.5, -23, su[3]!, 0.85)];

function figure(combo: ComboId): Fig {
  switch (combo) {
    case 'scatter':
      return { stars: [s(-22, -14, 'sun', 0.8, true), s(17, -22, 'moon', 0.7, true), s(-9, 20, 'star', 0.7, true), s(24, 13, 'comet', 0.8, true)], links: [] };
    case 'pair': {
      const a = s(-13, 4, 'sun', 1.1), b = s(13, -6, 'moon', 1.1);
      return { stars: [s(-26, -22, 'star', 0.6, true), s(26, 22, 'comet', 0.6, true), a, b], links: [seg(a, b)] };
    }
    case 'twoPair': {
      const a = s(-27, -2, 'sun'), b = s(-9, -20, 'moon'), c = s(9, 20, 'star'), d = s(27, 2, 'comet');
      return { stars: [a, b, c, d], links: [seg(a, b), seg(c, d)] };
    }
    case 'mirror': {
      const a = s(-30, 18, 'sun', 0.9), b = s(-11, 18, 'moon', 0.9), c = s(11, 18, 'star', 0.9), d = s(30, 18, 'comet', 0.9);
      return { stars: [a, b, c, d], links: [bow(a, d, 72), bow(b, c, 34)] };
    }
    case 'triple': {
      const a = s(0, -24, 'sun'), b = s(-24, 17, 'moon'), c = s(24, 17, 'comet');
      return { stars: [a, b, c], links: [poly([a, b, c], true)] };
    }
    case 'straight': {
      const st = stairStars(['sun', 'moon', 'star', 'comet']);
      return { stars: st, links: [STEPS] };
    }
    case 'flush': {
      const st = [s(-27, 8, 'sun'), s(-9, -6, 'sun'), s(9, 8, 'sun'), s(27, -6, 'sun')];
      return { stars: st, links: [poly(st)], glow: 'sun' };
    }
    case 'cascade': {
      const st = [s(-28, 23, 'sun'), s(-11, 9, 'moon'), s(6, -5, 'star'), s(23, -19, 'comet')];
      return { stars: st, links: [poly(st) + 'L33 -27', ARROW] };
    }
    case 'quartet': {
      const st = [s(0, -27, 'sun'), s(27, 0, 'moon'), s(0, 27, 'star'), s(-27, 0, 'comet')];
      return { stars: [...st, s(0, 0, 'sun', 0.45)], links: [poly(st, true)] };
    }
    case 'starFlush': {
      const st = stairStars(['moon', 'moon', 'moon', 'moon']);
      return { stars: st, links: [STEPS], glow: 'moon' };
    }
    case 'supernova': {
      const st = [s(-28, 23, 'star'), s(-11, 9, 'star'), s(6, -5, 'star'), s(23, -19, 'star', 1.3)];
      return { stars: st, links: [poly(st)], glow: 'star', burst: 3 };
    }
  }
}

/** Сила созвездия → эмаль: от серебра у Россыпи до золотой ночи у Сверхновой. */
const TIER: Record<ComboId, number> = {
  scatter: 0, pair: 1, twoPair: 1, triple: 2, straight: 2, mirror: 2, flush: 2, cascade: 3, quartet: 3, starFlush: 4, supernova: 4,
};
const TIER_FAM = ['silver', 'lapis', 'star', 'wine', 'gold'] as const;

const goldLine = (ctx: Ctx) => stops(ctx.createLinearGradient(0, -40, 0, 40), [[0, '#fff2c8'], [0.5, '#f6c25b'], [1, '#d08a2a']]);

/** Фигура: ореол масти, линии, звёзды. `k` — толщина для мелких размеров. */
function drawFigure(ctx: Ctx, f: Fig, k: number, glowLines: boolean): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (f.glow) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 42);
    stops(g, [[0, SUIT_PAINT[f.glow][0] + '66'], [0.6, SUIT_PAINT[f.glow][0] + '22'], [1, SUIT_PAINT[f.glow][0] + '00']]);
    ctx.fillStyle = g;
    ctx.fillRect(-50, -50, 100, 100);
  }
  if (f.burst !== undefined) {
    const b = f.stars[f.burst]!;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = stops(ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 24), [[0, '#fff6d6'], [0.5, '#ffe6a8aa'], [1, '#ffe6a800']]);
    ctx.fill(path(sparkle(b.x, b.y, 24, 8, 0.2)));
    ctx.restore();
  }
  const lw = 3.2 * k;
  for (const d of f.links) {
    ctx.save();
    ctx.translate(0, 1.6);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = lw;
    ctx.stroke(path(d));
    ctx.restore();
    if (glowLines) {
      ctx.save();
      ctx.shadowColor = 'rgba(246, 194, 91, 0.85)';
      ctx.shadowBlur = 6;
    }
    ctx.strokeStyle = goldLine(ctx);
    ctx.lineWidth = lw;
    ctx.stroke(path(d));
    if (glowLines) ctx.restore();
  }
  for (const st of f.stars) {
    const r = (st.dim ? 7 : 10.5) * st.r * k;
    const [base, hi] = SUIT_PAINT[st.su];
    ctx.globalAlpha = st.dim ? 0.42 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill(path(sparkle(st.x, st.y + 1.6, r, 4, 0.32)));
    ctx.fillStyle = base;
    ctx.fill(path(sparkle(st.x, st.y, r, 4, 0.32)));
    ctx.fillStyle = hi;
    ctx.fill(path(sparkle(st.x, st.y - r * 0.05, r * 0.5, 4, 0.36)));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, r * 0.17, 0, PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function plate(ctx: Ctx, fam: string, rare: boolean): void {
  const f = FAM[fam]!;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  roundedRect(ctx, -47, -45.8, 94, 94, 16);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -46, -46, 46, 46, rare);
  roundedRect(ctx, -46, -46, 92, 92, 15);
  ctx.fill();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -22, 0, 0, -10, 70), [[0, mix(f.base, '#ffffff', 0.08)], [0.5, mix(f.base, f.deep, 0.6)], [1, f.deep]]);
  roundedRect(ctx, -40, -40, 80, 80, 10);
  ctx.fill();
  ctx.strokeStyle = '#2a1804';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** A «Эмаль»: латунь и эмаль цвета силы. */
function drawA(ctx: Ctx, combo: ComboId, size: number): void {
  const tier = TIER[combo];
  plate(ctx, TIER_FAM[tier]!, tier === 4);
  ctx.save();
  ctx.scale(0.92, 0.92);
  drawFigure(ctx, figure(combo), size < 40 ? 1.3 : 1, false);
  ctx.restore();
}

/** C «Без рамки»: круг ночного неба под фигурой, линии светятся. */
function drawC(ctx: Ctx, combo: ComboId, size: number): void {
  const tier = TIER[combo];
  const f = FAM[TIER_FAM[tier]!]!;
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, 50), [[0, mix(f.base, '#191641', 0.55) + 'ee'], [0.7, mix(f.base, '#0c0d2c', 0.8) + '88'], [1, '#0c0d2c00']]);
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, PI * 2);
  ctx.fill();
  // Тонкое кольцо-горизонт: чем сильнее созвездие, тем больше на нём золотых меток
  ctx.strokeStyle = 'rgba(255, 230, 168, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe6a8';
  for (let i = 0; i < tier; i++) {
    const a = -PI / 2 + (i - (tier - 1) / 2) * 0.26;
    ctx.beginPath();
    ctx.arc(cos(a) * 44, sin(a) * 44, 2.2, 0, PI * 2);
    ctx.fill();
  }
  drawFigure(ctx, figure(combo), size < 40 ? 1.35 : 1.05, true);
}

/** Какие карты примера совпали (как в схеме Справочника). */
function lit(combo: ComboId): boolean[] {
  if (combo === 'scatter') return [false, false, false, false];
  if (combo === 'pair') return [true, true, false, false];
  if (combo === 'triple') return [true, true, false, true];
  return [true, true, true, true];
}

/** B «Карты»: пример линии 2×2 — ранги крупно, цвет — масть, совпавшие в золоте. */
function drawB(ctx: Ctx, combo: ComboId): void {
  const tier = TIER[combo];
  plate(ctx, 'lapis', tier === 4);
  const ex = COMBO_EXAMPLES[combo];
  const on = lit(combo);
  const W = 31, H = 33;
  ex.forEach(([rank, su], i) => {
    const x = (i % 2 ? 3 : -34);
    const y = (i < 2 ? -36 : 3);
    const [base, hi] = SUIT_PAINT[su];
    ctx.globalAlpha = on[i] ? 1 : 0.4;
    ctx.fillStyle = stops(ctx.createLinearGradient(0, y, 0, y + H), [[0, mix(base, '#141238', 0.62)], [1, '#0e0c26']]);
    roundedRect(ctx, x, y, W, H, 6);
    ctx.fill();
    ctx.strokeStyle = on[i] ? goldLine(ctx) : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = on[i] ? 2.6 : 1.2;
    ctx.stroke();
    ctx.fillStyle = hi;
    ctx.font = "800 24px 'Manrope Variable', Manrope, system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(rank), x + W / 2, y + H / 2 + 1.5);
    ctx.globalAlpha = 1;
  });
}

/** Иконка созвездия выбранного варианта: size×size. */
export function drawChartVariant(ctx: Ctx, combo: ComboId, size: number, style: ChartStyle): void {
  ctx.save();
  stage(ctx, size);
  if (style === 'a') drawA(ctx, combo, size);
  else if (style === 'b') drawB(ctx, combo);
  else drawC(ctx, combo, size);
  ctx.restore();
}

/** DEV-переключатель витрины: `?charts=a|b|c`. В сборке игры всегда старая схема. */
export function chartStyle(): ChartStyle | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get('charts');
  return v === 'a' || v === 'b' || v === 'c' ? v : null;
}
