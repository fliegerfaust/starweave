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
  /** Мифы открыты, печатей нет (витрина MY.3). */
  myths?: boolean;
  /** Свои Знамения вместо обычных и их счётчики (витрина MY.5). */
  omens?: string[];
  omenData?: Record<string, Record<string, number>>;
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

/** Кассиопея из Лун ждёт девятку Луны в клетке 7; рядом карты, которые линий не закрывают. */
const MYTH_SKY: [string, number][] = [['2m', 0], ['5m', 5], ['7m', 2], ['4s', 12], ['8t', 14], ['3c', 10]];

const SCENARIOS: Record<string, Scenario> = {
  /** Подсказка мифа: фигуре не хватает одной звезды, хода нет (витрина MY.3). */
  mythHint: { sky: MYTH_SKY, moves: [], extra: ['9m', '1s', '6c'], score: 1200, target: 6000, movesLeft: 8, think: 0, hold: 600000, myths: true },
  /** Миф складывается: девятка Луны закрывает Кассиопею. */
  myth: { sky: MYTH_SKY, moves: [['9m', 7]], extra: ['1s', '6c'], score: 1200, target: 6000, movesLeft: 8, think: 1200, myths: true },
  /** Звездочёт: Кассиопее не хватает двух Лун, обе в руке — небо подсказывает две клетки (MY.5). */
  mythTwoStars: {
    sky: [['2m', 0], ['5m', 5], ['4s', 12], ['8t', 14], ['3c', 11]], moves: [], extra: ['7m', '9m', '1s'],
    score: 1200, target: 6000, movesLeft: 8, think: 0, hold: 600000, myths: true,
    omens: ['stargazer', 'starlight', 'crossroads', 'doubleStar', 'glassCannon'],
  },
  /** Легенда и Астролог: Кассиопея складывается, её карты остаются на небе (MY.5). */
  mythLegend: {
    sky: MYTH_SKY, moves: [['9m', 7]], extra: ['1s', '6c'], score: 1200, target: 60000, movesLeft: 8, think: 1200, myths: true,
    omens: ['astrologer', 'legend', 'starlight', 'crossroads', 'doubleStar'], omenData: { astrologer: { myths: 3 } },
  },
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
  run.chapter.at = 1;
  run.gold = 23;
  run.omens = (sc.omens ?? OMENS).map((id) => {
    const omen = createOmen(run, id);
    Object.assign(omen.data, sc.omenData?.[id]);
    return omen;
  });
  if (sc.myths) {
    run.unlocks.myths = true;
    // Четыре мифа уже в каталоге: Кассиопея — пятая, «Новый миф · 5 из 12»
    app.profile.mythsFound = ['pleiades', 'sagitta', 'triangulum', 'cygnus'];
  }
  app.runs.beginNight();
  const night = run.night!;
  if (sc.myths) night.sealed = night.sealed.map(() => false);
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
    scene.forecast.off = true;
    scene.forecast.refreshClosers();
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
