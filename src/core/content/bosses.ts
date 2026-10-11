import type { EffectHooks } from '../effects';
import type { Suit } from '../types';
import { SUITS } from '../types';

export interface BossDef extends EffectHooks {
  id: string;
  /** С какого созвездия Затмение может выпасть. */
  minAnte: number;
  /** Множитель цели ночи (некоторые Затмения сами по себе тяжелее). */
  targetScale?: number;
  suit?: Suit;
}

const suitEclipse = (suit: Suit): BossDef => ({
  id: `eclipse-${suit}`,
  minAnte: 1,
  suit,
  modifyRules(rules) {
    rules.debuffSuit = suit;
  },
});

export const BOSS_LIST: BossDef[] = [
  {
    id: 'void',
    minAnte: 1,
    modifyRules(rules) {
      rules.sealedCells += 2;
    },
  },
  ...SUITS.map(suitEclipse),
  {
    id: 'fog',
    minAnte: 1,
    modifyRules(rules) {
      rules.hideRanks = true;
    },
  },
  {
    id: 'drought',
    minAnte: 2,
    modifyRules(rules) {
      rules.handSize -= 1;
    },
  },
  {
    id: 'shortNight',
    minAnte: 2,
    modifyRules(rules) {
      rules.moves -= 5;
    },
  },
  {
    id: 'silence',
    minAnte: 1,
    modifyRules(rules) {
      rules.burns = 0;
    },
  },
  {
    id: 'gravity',
    minAnte: 2,
    modifyRules(rules) {
      rules.rowsIgnite = false;
      rules.diagonals = false;
    },
  },
  {
    id: 'judge',
    minAnte: 3,
    onLineScored(ctx) {
      if (ctx.combo === 'scatter') ctx.xMult(0);
    },
  },
  {
    id: 'wane',
    minAnte: 4,
    onLineScored(ctx) {
      ctx.xMult(0.5);
    },
  },
  {
    id: 'hunger',
    minAnte: 2,
    onLineScored(ctx) {
      if (ctx.run.gold > 0) ctx.gold(-1);
    },
  },
];

export const BOSSES: Record<string, BossDef> = Object.fromEntries(BOSS_LIST.map((b) => [b.id, b]));

export function bossDef(id: string): BossDef {
  const def = BOSSES[id];
  if (!def) throw new Error(`Неизвестное Затмение: ${id}`);
  return def;
}
