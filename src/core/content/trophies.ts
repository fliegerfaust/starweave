import { cardSuits } from '../deck';
import type { EffectHooks } from '../effects';
import type { Suit } from '../types';
import { SUITS } from '../types';
import { BOSS_LIST } from './bosses';
import { registry } from './registry';

/**
 * Трофей Затмения (TR.1): правило побеждённого Затмения, вывернутое в пользу игрока. Игрок
 * уже прочувствовал правило на себе — объяснять не нужно. `omen` — парное Знамение: его
 * можно взять вместо трофея.
 */
export interface TrophyDef extends EffectHooks {
  /** id Затмения — у каждого ровно один трофей. */
  id: string;
  omen: string;
}

/** Сколько трофеев держит забег; новый заменяет старый. */
export const TROPHY_SLOTS = 1;

/** Карты масти засчитываются дважды. */
const suitTrophy = (suit: Suit, omen: string): TrophyDef => ({
  id: `eclipse-${suit}`,
  omen,
  retriggers(ctx) {
    return cardSuits(ctx.card).includes(suit) ? 1 : 0;
  },
});

const SUIT_OMENS: Record<Suit, string> = { sun: 'sunWorship', moon: 'moonTide', star: 'starlight', comet: 'cometTrail' };

export const TROPHY_LIST: TrophyDef[] = [
  {
    // Звёздная пустота: одна клетка запечатана, карты рядом с ней — +4 множ.
    id: 'void',
    omen: 'collapsar',
    modifyRules(rules) {
      rules.sealedCells += 1;
    },
    onCardScored(ctx) {
      const n = ctx.rules.gridSize;
      const r = Math.floor(ctx.cell / n);
      const c = ctx.cell % n;
      const near = [r > 0 && ctx.cell - n, r < n - 1 && ctx.cell + n, c > 0 && ctx.cell - 1, c < n - 1 && ctx.cell + 1];
      if (near.some((i) => i !== false && ctx.night.sealed[i])) ctx.mult(4);
    },
  },
  ...SUITS.map((s) => suitTrophy(s, SUIT_OMENS[s])),
  {
    // Ясное небо: видны две верхние карты колоды
    id: 'fog',
    omen: 'nightOwl',
    modifyRules(rules) {
      rules.peek = Math.max(rules.peek ?? 0, 2);
    },
  },
  {
    // Изобилие: +1 карта в руке
    id: 'drought',
    omen: 'wideSky',
    modifyRules(rules) {
      rules.handSize += 1;
    },
  },
  {
    // Долгая ночь: +1 ход за каждый крест
    id: 'shortNight',
    omen: 'abacus',
    onIgnite(ctx) {
      if (ctx.lines.length >= 2) ctx.night.movesLeft += 1;
    },
  },
  {
    // Тишина: последний ход — +5 множ. за каждое несожжённое
    id: 'silence',
    omen: 'pyre',
    onLineScored(ctx) {
      if (ctx.night.movesLeft === 0 && ctx.night.burnsLeft > 0) ctx.mult(5 * ctx.night.burnsLeft);
    },
  },
  {
    // Столп притяжения: столбцы — ×2 множ.
    id: 'gravity',
    omen: 'pillar',
    onLineScored(ctx) {
      if (ctx.line.kind === 'col') ctx.xMult(2);
    },
  },
  {
    // Помилование: Россыпь считается Парой
    id: 'judge',
    omen: 'scatterbrain',
    modifyRules(rules) {
      rules.scatterAsPair = true;
    },
  },
  {
    // Полнолуние: первое созвездие ночи — ×2 множ.
    id: 'wane',
    omen: 'doubleStar',
    onNightStart(ctx) {
      ctx.data.lines = 0;
    },
    onLineScored(ctx) {
      if (!ctx.data.lines) ctx.xMult(2);
      ctx.data.lines = (ctx.data.lines ?? 0) + 1;
    },
  },
  {
    // Сытость: каждое третье созвездие ночи — +2 золота
    id: 'hunger',
    omen: 'tithe',
    onNightStart(ctx) {
      ctx.data.lines = 0;
    },
    onLineScored(ctx) {
      ctx.data.lines = (ctx.data.lines ?? 0) + 1;
      if (ctx.data.lines % 3 === 0) ctx.gold(2);
    },
  },
];

export const TROPHIES: Record<string, TrophyDef> = registry(TROPHY_LIST);

export function trophyDef(id: string): TrophyDef {
  const def = TROPHIES[id];
  if (!def) throw new Error(`Неизвестный трофей: ${id}`);
  return def;
}

// Трофей есть у каждого Затмения: новое Затмение без трофея — ошибка при загрузке
for (const boss of BOSS_LIST) trophyDef(boss.id);
