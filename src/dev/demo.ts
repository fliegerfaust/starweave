import { createOmen } from '@/core/omen-instance';
import { cardCode } from '@/core/tutorial';
import type { Card } from '@/core/types';
import type { App } from '@/game/app';
import type { NightScene } from '@/game/night/scene';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';
import { clip } from './capture';

/**
 * Сценарные ночи для роликов (`?demo=<сценарий>`, только в разработке): середина забега с
 * сильными Знамениями, расклад и ходы заданы заранее. `?demo` без имени — превью бота.
 * Покадровая запись — `npm run clips` (`&capture`), для превью бота — iOS-симулятор
 * (`xcrun simctl io booted recordVideo`).
 */

interface Scenario {
  /** Карты на небе до начала: код карты и клетка 0–15 (по строкам). */
  sky: [string, number][];
  /** Ходы по порядку; пусто — стоп-кадр без хода. */
  moves: [string, number][];
  /** Ещё карты в руке, кроме карт ходов. */
  extra?: string[];
  score: number;
  target: number;
  movesLeft: number;
  /** Пауза перед ходом: выбранная карта показывает прогноз созвездия, мс. */
  think: number;
  /** Длина стоп-кадра без хода, мс. */
  hold?: number;
  /** Без подписей прогноза — ответ не виден заранее. */
  noForecast?: boolean;
}

const OMENS = ['starlight', 'supernovaSeed', 'crossroads', 'doubleStar', 'glassCannon'];

/**
 * Крест: верхний ряд ждёт Флеша звёзд, правый столбец — Тройки девяток; девятка звёзд в углу
 * зажигает обе линии сразу.
 */
const CROSS_SKY: [string, number][] = [
  ['2t', 0], ['5t', 1], ['8t', 2],
  ['3m', 5], ['9s', 7],
  ['6m', 9], ['9m', 11],
  ['1s', 12], ['4c', 15],
];

const SCENARIOS: Record<string, Scenario> = {
  /** Превью бота: Каскад, подготовка и крест «Флеш + Тройка» — победа. */
  '': {
    sky: [['4s', 12], ['5m', 13], ['6t', 14], ['2t', 0], ['5t', 1], ['9s', 7], ['9m', 11]],
    moves: [['7c', 15], ['8t', 2], ['4c', 15], ['9t', 3]],
    score: 0,
    target: 30000,
    movesLeft: 6,
    think: 700,
  },
  /** Разгон счёта: те же четыре хода плотнее — от нуля до победы. */
  surge: {
    sky: [['4s', 12], ['5m', 13], ['6t', 14], ['2t', 0], ['5t', 1], ['9s', 7], ['9m', 11]],
    moves: [['7c', 15], ['8t', 2], ['4c', 15], ['9t', 3]],
    score: 0,
    target: 30000,
    movesLeft: 6,
    think: 450,
  },
  /** Одна карта — две линии. */
  cross: { sky: CROSS_SKY, moves: [['9t', 3]], extra: ['7c', '2m'], score: 6400, target: 30000, movesLeft: 3, think: 900 },
  /** Загадка: тот же расклад, хода нет — «куда бы ты положил?». */
  puzzle: { sky: CROSS_SKY, moves: [], extra: ['9t', '7c', '2m'], score: 6400, target: 30000, movesLeft: 3, think: 0, hold: 5500, noForecast: true },
  /** Каскад 4-5-6-7 по нижнему ряду закрывает ночь. */
  cascade: {
    sky: [['4s', 12], ['5m', 13], ['6t', 14], ['2t', 0], ['9s', 7], ['3m', 5]],
    moves: [['7c', 15]],
    extra: ['8t', '1s'],
    score: 25500,
    target: 30000,
    movesLeft: 2,
    think: 900,
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(app: App, name: string): Promise<void> {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`нет сценария ${name}`);
  // Опытный игрок: созвездия и крест уже в коллекции — без окон «Новое созвездие»
  app.profile.combosFound = [...COLLECTIBLE_COMBOS];
  app.profile.crossFound = true;
  app.runs.startRun('classic');
  const run = app.run!;
  run.ante = 3;
  run.nightIndex = 1;
  run.gold = 23;
  run.omens = OMENS.map((id) => createOmen(run, id));
  app.runs.beginNight();
  const night = run.night!;
  const used = new Set<number>();
  const take = (code: string): Card => {
    const card = run.deck.find((c) => !used.has(c.id) && cardCode(c) === code);
    if (!card) throw new Error(`нет карты ${code}`);
    used.add(card.id);
    return { ...card };
  };
  night.grid = night.grid.map(() => null);
  for (const [code, cell] of sc.sky) night.grid[cell] = take(code);
  const queue = [...sc.moves.map(([code]) => take(code)), ...(sc.extra ?? []).map(take)];
  const handSize = night.hand.length;
  const rest = run.deck.filter((c) => !used.has(c.id)).slice(0, 5).map((c) => ({ ...c }));
  night.hand = queue.slice(0, handSize);
  // Добор берёт с конца стопки: следующие ходы — сверху
  night.drawPile = [...rest, ...queue.slice(handSize).reverse()];
  night.movesLeft = sc.movesLeft;
  night.score = sc.score;
  night.target = sc.target;

  const w = window as unknown as { __scene?: NightScene };
  while (!w.__scene) await sleep(50);
  const scene = w.__scene;
  if (sc.noForecast) {
    scene.forecastOff = true;
    scene.refreshClosers();
  }
  // Запись — с уже собранного неба: первый кадр ролика сразу про игру
  await sleep(1200);
  clip.start();
  await sleep(300);
  if (!sc.moves.length) await sleep(sc.hold ?? 4000);
  for (const [code, cell] of sc.moves) {
    const index = night.hand.findIndex((c) => cardCode(c) === code);
    // Сначала выбор — виден прогноз созвездия, потом ход
    scene.select(index);
    await sleep(sc.think);
    await scene.place(index, cell);
    while (scene.busy) await sleep(50);
    await sleep(name ? 250 : 500);
  }
  // Победа: окно «Ночь пройдена» успевает показаться
  await sleep(night.result === 'won' ? 1600 : 1000);
  clip.stop();
}
