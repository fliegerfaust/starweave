import type { TraitCtx } from '../effects';
import { chance, type RngState } from '../rng';
import type { Card, Glyph } from '../types';

/**
 * Черта карты (TD.4): что карта делает сама, без Знамений. Сейчас черты — глифы; небесные
 * тела 0.9 (Полярная, Метеор, Пульсар) встанут сюда же со своими хуками. Хук объявляется,
 * только если нужен.
 */
export interface CardTraitDef {
  id: Glyph;
  /** Цена ритуала, наносящего черту на карту. */
  inscribePrice: number;
  /** Сколько раз дополнительно засчитать карту (Эхо). */
  retriggers?: number;
  /** Вклад при каждом срабатывании карты, после её ранга. */
  onScored?(ctx: TraitCtx): void;
  /** Раз за ход на карту, после её срабатываний: `true` — карта разобьётся (Стекло). */
  breaks?(rng: RngState): boolean;
  /** Карта носит все масти (Призма): для флеша и Знамений мастей. */
  wildSuit?: boolean;
}

export const GLASS_BREAK_CHANCE = 0.25;

/** `Record` по союзу глифов: новый глиф без черты — ошибка типов, а не тихий пропуск. */
export const TRAITS: Record<Glyph, CardTraitDef> = {
  gilded: { id: 'gilded', inscribePrice: 4, onScored: (ctx) => ctx.gold(2) },
  blazing: { id: 'blazing', inscribePrice: 4, onScored: (ctx) => ctx.mult(4) },
  radiant: { id: 'radiant', inscribePrice: 4, onScored: (ctx) => ctx.light(30) },
  echo: { id: 'echo', inscribePrice: 5, retriggers: 1 },
  glass: { id: 'glass', inscribePrice: 4, onScored: (ctx) => ctx.xMult(2), breaks: (rng) => chance(rng, GLASS_BREAK_CHANCE) },
  prism: { id: 'prism', inscribePrice: 5, wildSuit: true },
};

/** Черта карты или null — простая карта. */
export function traitOf(card: Pick<Card, 'glyph'>): CardTraitDef | null {
  return card.glyph ? TRAITS[card.glyph] : null;
}
