import { withGlyph } from '../deck';
import type { Card, Glyph, RunState, Suit } from '../types';
import { GLYPHS, MAX_RANK, MIN_RANK, SUITS } from '../types';

/** Колода не может стать меньше — иначе небо не заполнить. */
export const MIN_DECK_SIZE = 20;

export interface RitualDef {
  id: string;
  price: number;
  minTargets: number;
  maxTargets: number;
  /** Подходит ли карта как цель (например, Возвышение не берёт девятки). */
  canTarget?(card: Card): boolean;
  /** Возвращает false, если ритуал неприменим в текущем забеге. */
  available?(run: RunState): boolean;
  apply(run: RunState, targets: Card[]): void;
}

function replaceInDeck(run: RunState, card: Card, next: Card): void {
  const i = run.deck.findIndex((c) => c.id === card.id);
  if (i >= 0) run.deck[i] = next;
}

const transmute = (suit: Suit): RitualDef => ({
  id: `transmute-${suit}`,
  price: 3,
  minTargets: 1,
  maxTargets: 3,
  canTarget: (c) => c.suit !== suit,
  apply(run, targets) {
    for (const t of targets) replaceInDeck(run, t, { ...t, suit });
  },
});

const inscribe = (glyph: Glyph): RitualDef => ({
  id: `glyph-${glyph}`,
  price: glyph === 'echo' || glyph === 'prism' ? 5 : 4,
  minTargets: 1,
  maxTargets: 1,
  apply(run, targets) {
    for (const t of targets) replaceInDeck(run, t, withGlyph(t, glyph));
  },
});

export const RITUAL_LIST: RitualDef[] = [
  ...SUITS.map(transmute),
  {
    id: 'ascend',
    price: 3,
    minTargets: 1,
    maxTargets: 2,
    canTarget: (c) => c.rank < MAX_RANK,
    apply(run, targets) {
      for (const t of targets) replaceInDeck(run, t, { ...t, rank: Math.min(MAX_RANK, t.rank + 1) });
    },
  },
  {
    id: 'descend',
    price: 3,
    minTargets: 1,
    maxTargets: 2,
    canTarget: (c) => c.rank > MIN_RANK,
    apply(run, targets) {
      for (const t of targets) replaceInDeck(run, t, { ...t, rank: Math.max(MIN_RANK, t.rank - 1) });
    },
  },
  {
    id: 'banish',
    price: 3,
    minTargets: 1,
    maxTargets: 2,
    available: (run) => run.deck.length > MIN_DECK_SIZE,
    apply(run, targets) {
      const ids = new Set(targets.slice(0, Math.max(0, run.deck.length - MIN_DECK_SIZE)).map((t) => t.id));
      run.deck = run.deck.filter((c) => !ids.has(c.id));
    },
  },
  {
    id: 'twin',
    price: 4,
    minTargets: 1,
    maxTargets: 1,
    apply(run, targets) {
      for (const t of targets) run.deck.push({ ...withGlyph(t, t.glyph), id: run.nextCardId++ });
    },
  },
  ...GLYPHS.map(inscribe),
];

export const RITUALS: Record<string, RitualDef> = Object.fromEntries(RITUAL_LIST.map((r) => [r.id, r]));

export function ritualDef(id: string): RitualDef {
  const def = RITUALS[id];
  if (!def) throw new Error(`Неизвестный ритуал: ${id}`);
  return def;
}
