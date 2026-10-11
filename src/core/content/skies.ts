import type { DeckSpec } from '../deck';
import type { Rules } from '../types';

/** Как открывается колода неба. Проверяет мета-слой. */
export type Unlock =
  | { kind: 'default' }
  | { kind: 'reachAnte'; ante: number }
  | { kind: 'winRun' }
  | { kind: 'linesTotal'; lines: number };

export interface SkyDef {
  id: string;
  deck: DeckSpec;
  startGold: number;
  unlock: Unlock;
  modifyRules?(rules: Rules): void;
  startOmens?: string[];
}

export const SKY_LIST: SkyDef[] = [
  { id: 'classic', deck: {}, startGold: 4, unlock: { kind: 'default' } },
  {
    id: 'twins',
    deck: { suits: ['sun', 'moon'], copies: 2 },
    startGold: 4,
    unlock: { kind: 'reachAnte', ante: 3 },
  },
  {
    id: 'wanderer',
    deck: {},
    startGold: 4,
    unlock: { kind: 'linesTotal', lines: 150 },
    modifyRules(rules) {
      rules.moves += 3;
      rules.burns -= 1;
    },
  },
  {
    id: 'abyss',
    deck: { minRank: 1, maxRank: 7 },
    startGold: 4,
    unlock: { kind: 'reachAnte', ante: 5 },
    modifyRules(rules) {
      rules.omenSlots += 1;
    },
  },
  { id: 'gilded', deck: {}, startGold: 12, unlock: { kind: 'winRun' }, startOmens: ['miser'] },
];

export const SKIES: Record<string, SkyDef> = Object.fromEntries(SKY_LIST.map((s) => [s.id, s]));

export function skyDef(id: string): SkyDef {
  const def = SKIES[id];
  if (!def) throw new Error(`Неизвестная колода неба: ${id}`);
  return def;
}
