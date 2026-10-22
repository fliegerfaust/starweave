import { cloneCard } from './deck';
import { allContent } from './content/pools';
import { newRun } from './run';
import { shuffle } from './rng';
import type { Card, RunState, ShopState, Suit } from './types';

/**
 * Учебный забег: та же механика, но карты приходят по сценарию, чтобы каждый шаг
 * обучения гарантированно получился (Пара, сжигание, крест «флеш + тройка»).
 */

type Code = `${number}${'s' | 'm' | 't' | 'c'}`;
const SUIT: Record<string, Suit> = { s: 'sun', m: 'moon', t: 'star', c: 'comet' };

export interface TutorialNightScript {
  target: number;
  moves: number;
  hand: Code[];
  /** Карты в порядке добора. */
  draws: Code[];
}

export const TUTORIAL_NIGHTS: TutorialNightScript[] = [
  {
    // Ряд 3: 3☀ 3☾ 7✦ 5☄ — Пара. Сжечь 1☾. Подготовка креста в клетке 3:
    // ряд 0 — 2✦ 5✦ 8✦ (+9✦ = флеш), столбец 3 — 9☀ 9☾ 4☄ (+9✦ = тройка).
    target: 150,
    moves: 14,
    hand: ['3s', '3m', '7t', '5c'],
    draws: ['1m', '2t', '5t', '8t', '9s', '9m', '4c', '9t', '6s', '2m', '7c'],
  },
  {
    // Три шестёрки в руке — Тройка сразу, чтобы увидеть Знамение в деле.
    target: 120,
    moves: 12,
    hand: ['6s', '6m', '6t', '2c'],
    draws: ['4s', '8m', '1t', '3c', '7s', '5m'],
  },
];

/** Клетки сценария первой ночи — их знает и режиссёр обучения. */
export const TUTORIAL_CELLS = {
  pairRow: [12, 13, 14, 15],
  crossSetup: [
    { card: '2t', cell: 0 },
    { card: '5t', cell: 1 },
    { card: '8t', cell: 2 },
    { card: '9s', cell: 7 },
    { card: '9m', cell: 11 },
    { card: '4c', cell: 15 },
  ],
  cross: { card: '9t', cell: 3 },
} as const;

export function newTutorialRun(): RunState {
  // Обучение — цепочка из трёх ночей, без развилок
  const run = newRun({ seed: 20261012, unlocks: { ...allContent(), routes: false } });
  run.tutorial = true;
  run.gold = 4;
  return run;
}

function find(deck: Card[], code: Code): Card {
  const rank = Number(code.slice(0, -1));
  const suit = SUIT[code.slice(-1)]!;
  const card = deck.find((c) => c.rank === rank && c.suit === suit);
  if (!card) throw new Error(`В колоде нет карты ${code}`);
  return cloneCard(card);
}

/** Подменяет руку и колоду только что начатой учебной ночи. */
export function applyTutorialNight(run: RunState, index: number): void {
  const script = TUTORIAL_NIGHTS[index];
  const night = run.night;
  if (!script || !night) return;
  const used = new Set<string>([...script.hand, ...script.draws]);
  const hand = script.hand.map((c) => find(run.deck, c));
  const draws = script.draws.map((c) => find(run.deck, c));
  const rest = shuffle(
    run.rng,
    run.deck.filter((c) => !used.has(`${c.rank}${Object.keys(SUIT).find((k) => SUIT[k] === c.suit)}`)).map(cloneCard),
  );
  night.hand = hand;
  // Добор берёт карты с конца стопки
  night.drawPile = [...rest, ...draws.reverse()];
  night.target = script.target;
  night.movesLeft = script.moves;
}

/** Учебная Обсерватория: два понятных Знамения, карта Пары и ритуал Эха. */
export function tutorialShop(): ShopState {
  return {
    omens: [
      { kind: 'omen', omenId: 'stardust', price: 4, sold: false },
      { kind: 'omen', omenId: 'twinStars', price: 5, sold: false },
    ],
    items: [
      { kind: 'chart', combo: 'pair', price: 3, sold: false },
      { kind: 'ritual', ritualId: 'glyph-echo', price: 5, sold: false },
    ],
    packs: [],
    rerollCost: 5,
  };
}

export function cardCode(card: Card): Code {
  const s = Object.keys(SUIT).find((k) => SUIT[k] === card.suit)!;
  return `${card.rank}${s}` as Code;
}
