import { BODY_IDS, type BodyId } from '../types';
import { OMEN_LIST } from './omens';
import { RITUAL_LIST } from './rituals';
import type { Unlock } from './skies';
import { MYTHS_UNLOCK } from './myths';
import { RESONANCE_UNLOCK } from './resonance';
import { TROPHY_UNLOCK } from './trophies';

/**
 * Снимок открытий забега (TD.8): какие Знамения и ритуалы могут выпасть в лавке и пакетах,
 * есть ли дар ночи и какие в нём тела. Берётся при старте и лежит в `RunState.unlocks`:
 * открытие посреди забега его не меняет, поэтому забег воспроизводим по журналу, а вызов
 * дня одинаков у всех.
 */
export interface Unlocks {
  omens: string[];
  rituals: string[];
  /** Дар ночи после победной ночи (ступень 1). */
  gift: boolean;
  /** Небесные тела, которые могут выпасть в даре (ступень 3). */
  bodies: BodyId[];
  /** Развилки главы: Ночь или Яркая ночь на каждом шаге (ступень 2). */
  routes: boolean;
  /** Комета и Телескоп на развилках — шаги без ночи (ступень 6). */
  wonders: boolean;
  /** Трофей или Знамение после Затмения (ступень 4). */
  trophies: boolean;
  /** Мифические созвездия на небе (ступень 5). */
  myths: boolean;
  /** Резонанс: пары Знамений сливаются в легендарное (ступень 8). */
  resonance: boolean;
}

/** Контент с правилом открытия. Без `unlock` — открыт с первого забега. */
interface Unlockable {
  id: string;
  unlock?: Unlock;
}

/** Ступень «Комета и Телескоп»: дойти до 5-й главы. */
export const WONDERS_UNLOCK: Unlock = { kind: 'reachAnte', ante: 5 };

/** Ступень «Развилки»: дойти до 3-й главы. */
export const ROUTES_UNLOCK: Unlock = { kind: 'reachAnte', ante: 3 };

/** Ступень «Дар ночи»: закончить первый забег. */
export const GIFT_UNLOCK: Unlock = { kind: 'runsDone', runs: 1 };

/**
 * Ступень «Небесные тела»: первые три — за 3 побеждённых Затмения, остальные — за 8
 * (пока небосвод SK не раздал их по своим созвездиям).
 */
export const BODY_UNLOCKS: Record<BodyId, Unlock> = {
  polaris: { kind: 'eclipses', count: 3 },
  meteor: { kind: 'eclipses', count: 3 },
  pulsar: { kind: 'eclipses', count: 3 },
  twin: { kind: 'eclipses', count: 8 },
  nebula: { kind: 'eclipses', count: 8 },
  blackhole: { kind: 'eclipses', count: 8 },
};

function pick(list: readonly Unlockable[], open: (unlock: Unlock) => boolean): string[] {
  return list.filter((item) => !item.unlock || open(item.unlock)).map((item) => item.id);
}

/**
 * Пулы по правилу `open`: порядок — как в списках контента (от него зависят броски ГПСЧ).
 * `shared` — набор, одинаковый у всех (вызов дня): дар в нём есть, поздних тел нет.
 */
export function contentPools(open: (unlock: Unlock) => boolean, shared = false): Unlocks {
  return {
    omens: pick(OMEN_LIST, open),
    rituals: pick(RITUAL_LIST, open),
    gift: shared || open(GIFT_UNLOCK),
    routes: shared || open(ROUTES_UNLOCK),
    // Вызов дня — только ступени 0–2, одинаковые у всех
    wonders: !shared && open(WONDERS_UNLOCK),
    trophies: !shared && open(TROPHY_UNLOCK),
    myths: !shared && open(MYTHS_UNLOCK),
    resonance: !shared && open(RESONANCE_UNLOCK),
    bodies: BODY_IDS.filter((b) => open(BODY_UNLOCKS[b])),
  };
}

/** Весь контент: сим, бот и тесты играют без ограничений по открытиям. */
export function allContent(): Unlocks {
  return contentPools(() => true);
}

/**
 * Базовый набор без открытий — одинаков для всех (вызов дня, архив, вызов друга): ступени
 * 0–2 открыты всем, так что дар ночи и развилки в нём есть, а небесных тел нет.
 */
export function baseContent(): Unlocks {
  return contentPools(() => false, true);
}
