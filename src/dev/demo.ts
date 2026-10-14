import { createOmen } from '@/core/omen-instance';
import { cardCode } from '@/core/tutorial';
import type { Card } from '@/core/types';
import type { App } from '@/game/app';
import type { NightScene } from '@/game/night/scene';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';

/**
 * Ролик для превью (`?demo`, только в разработке): середина забега с сильными Знамениями,
 * небо наполовину заполнено, четыре хода — Каскад, подготовка, крест «Флеш + Тройка» и победа.
 * Запись — в iOS-симуляторе (`xcrun simctl io booted recordVideo`).
 */

/** Карты на небе до начала: нижний ряд ждёт Каскада, верхний ряд и правый столбец — креста. */
const PRESET: [string, number][] = [
  ['4s', 12], ['5m', 13], ['6t', 14],
  ['2t', 0], ['5t', 1],
  ['9s', 7], ['9m', 11],
];
/** Ходы по порядку. */
const MOVES: [string, number][] = [
  ['7c', 15], // Каскад в нижнем ряду
  ['8t', 2],
  ['4c', 15],
  ['9t', 3], // крест: Флеш звёзд по ряду и Тройка девяток по столбцу
];
const FILLER = ['1s', '3m', '2c', '6m', '1t'];
const OMENS = ['starlight', 'supernovaSeed', 'crossroads', 'doubleStar', 'glassCannon'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(app: App): Promise<void> {
  // Опытный игрок: созвездия и крест уже в коллекции — без окон «Новое созвездие»
  app.profile.combosFound = [...COLLECTIBLE_COMBOS];
  app.profile.crossFound = true;
  app.startRun('classic');
  const run = app.run!;
  run.ante = 3;
  run.nightIndex = 1;
  run.gold = 23;
  run.omens = OMENS.map((id) => createOmen(run, id));
  app.beginNight();
  const night = run.night!;
  const used = new Set<number>();
  const take = (code: string): Card => {
    const card = run.deck.find((c) => !used.has(c.id) && cardCode(c) === code);
    if (!card) throw new Error(`нет карты ${code}`);
    used.add(card.id);
    return { ...card };
  };
  night.grid = night.grid.map(() => null);
  for (const [code, cell] of PRESET) night.grid[cell] = take(code);
  const moves = MOVES.map(([code]) => take(code));
  const handSize = night.hand.length;
  const fillers = FILLER.map(take);
  night.hand = moves.slice(0, handSize);
  // Добор берёт с конца стопки: следующие ходы — сверху
  night.drawPile = [...fillers, ...moves.slice(handSize).reverse()];
  night.movesLeft = 6;
  // Каскад даёт ~5 тыс., крест — ещё ~28 тыс.: ночь выигрывается именно крестом
  night.target = 30000;

  const w = window as unknown as { __scene?: NightScene };
  while (!w.__scene) await sleep(50);
  const sc = w.__scene;
  await sleep(1200);
  for (const [code, cell] of MOVES) {
    const index = night.hand.findIndex((c) => cardCode(c) === code);
    // Сначала выбор — виден прогноз созвездия, потом ход
    sc.select(index);
    await sleep(700);
    await sc.place(index, cell);
    while (sc.busy) await sleep(50);
    await sleep(500);
  }
}
