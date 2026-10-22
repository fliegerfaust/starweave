import type { TraitCtx } from '../effects';
import { chance, type RngState } from '../rng';
import { MAX_RANK, MIN_RANK, type BodyId, type Card, type Glyph, type NightState, type Rules } from '../types';

/** Карта на небе после выкладки: Метеор выбирает, кого выбить. */
export interface TraitPlacedCtx {
  night: NightState;
  rules: Rules;
  card: Card;
  cell: number;
  /** Клетки линий, которые эта карта закрыла, — их Метеор не трогает. */
  closing: ReadonlySet<number>;
  /** Убрать карту с клетки в сброс. */
  knock(cell: number): void;
}

/**
 * Черта карты (TD.4): что карта делает сама, без Знамений. Черты — глифы и небесные тела
 * (GF.3); у карты либо глиф, либо тело. Хук объявляется, только если нужен.
 */
export interface CardTraitDef {
  id: Glyph | BodyId;
  /** Цена ритуала, наносящего черту на карту (только у глифов). */
  inscribePrice?: number;
  /** Сколько раз дополнительно засчитать карту (Эхо). */
  retriggers?: number;
  /** Вклад при каждом срабатывании карты, после её ранга. */
  onScored?(ctx: TraitCtx): void;
  /** Раз за ход на карту, после её срабатываний: `true` — карта разобьётся (Стекло). */
  breaks?(rng: RngState): boolean;
  /** Карта носит все масти (Призма): для флеша и Знамений мастей. */
  wildSuit?: boolean;
  /** Карта легла на небо, до поиска линий (Метеор). */
  onPlaced?(ctx: TraitPlacedCtx): void;
  /** Судьба после вспышки: остаётся на небе (Полярная) или уходит из колоды (Чёрная дыра). */
  fate?: 'stays' | 'consumed';
  /**
   * Какими рангами карта может встать в линию — линия берёт выгоднейший (Туманность).
   * `both` — карта считается обоими сразу для пар и троек (Двойник).
   */
  ranks?(card: Card): { options: number[]; both?: boolean };
  /** Копит множитель от вспышек рядом до конца ночи (Пульсар), за каждую линию. */
  pulse?: number;
}

export const GLASS_BREAK_CHANCE = 0.25;
/** Чёрная дыра: ×множитель линии, в которой схлопнулась. */
export const BLACKHOLE_XMULT = 2;
export const PULSAR_CHARGE = 2;

/** `Record` по союзу глифов: новый глиф без черты — ошибка типов, а не тихий пропуск. */
export const TRAITS: Record<Glyph, CardTraitDef> = {
  gilded: { id: 'gilded', inscribePrice: 4, onScored: (ctx) => ctx.gold(2) },
  blazing: { id: 'blazing', inscribePrice: 4, onScored: (ctx) => ctx.mult(4) },
  radiant: { id: 'radiant', inscribePrice: 4, onScored: (ctx) => ctx.light(30) },
  echo: { id: 'echo', inscribePrice: 5, retriggers: 1 },
  glass: { id: 'glass', inscribePrice: 4, onScored: (ctx) => ctx.xMult(2), breaks: (rng) => chance(rng, GLASS_BREAK_CHANCE) },
  prism: { id: 'prism', inscribePrice: 5, wildSuit: true },
};

const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Соседи клетки по стороне (Метеор) или и по диагонали (Пульсар). */
export function neighbours(cell: number, size: number, diagonal: boolean): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && !ORTHOGONAL.some(([a, b]) => a === dr && b === dc)) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < size && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
}

/** Небесные тела, первая волна (GF.3). Порядок — порядок открытия. */
export const BODY_TRAITS: Record<BodyId, CardTraitDef> = {
  polaris: { id: 'polaris', fate: 'stays' },
  meteor: {
    id: 'meteor',
    // Выбивает самого слабого соседа по стороне, кроме карт закрытой им линии
    onPlaced({ night, rules, cell, closing, knock }) {
      let target = -1;
      for (const n of neighbours(cell, rules.gridSize, false)) {
        const card = night.grid[n];
        if (!card || closing.has(n)) continue;
        if (target < 0 || card.rank < night.grid[target]!.rank || (card.rank === night.grid[target]!.rank && n < target)) target = n;
      }
      if (target >= 0) knock(target);
    },
  },
  pulsar: { id: 'pulsar', pulse: PULSAR_CHARGE },
  twin: { id: 'twin', ranks: (card) => ({ options: card.rank < MAX_RANK ? [card.rank, card.rank + 1] : [card.rank], both: true }) },
  nebula: { id: 'nebula', ranks: () => ({ options: Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, i) => MIN_RANK + i) }) },
  blackhole: { id: 'blackhole', fate: 'consumed', onScored: (ctx) => ctx.xMult(BLACKHOLE_XMULT) },
};

/** Черта карты или null — простая карта. */
export function traitOf(card: Pick<Card, 'glyph' | 'body'>): CardTraitDef | null {
  if (card.body) return BODY_TRAITS[card.body];
  return card.glyph ? TRAITS[card.glyph] : null;
}
