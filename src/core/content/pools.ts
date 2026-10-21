import { OMEN_LIST } from './omens';
import { RITUAL_LIST } from './rituals';
import type { Unlock } from './skies';

/**
 * Снимок открытий забега (TD.8): какие Знамения и ритуалы могут выпасть в лавке и пакетах.
 * Берётся при старте и лежит в `RunState.unlocks`: открытие посреди забега его не меняет,
 * поэтому забег воспроизводим по журналу, а вызов дня одинаков у всех.
 */
export interface Unlocks {
  omens: string[];
  rituals: string[];
}

/** Контент с правилом открытия. Без `unlock` — открыт с первого забега. */
interface Unlockable {
  id: string;
  unlock?: Unlock;
}

function pick(list: readonly Unlockable[], open: (unlock: Unlock) => boolean): string[] {
  return list.filter((item) => !item.unlock || open(item.unlock)).map((item) => item.id);
}

/** Пулы по правилу `open`: порядок — как в списках контента (от него зависят броски ГПСЧ). */
export function contentPools(open: (unlock: Unlock) => boolean): Unlocks {
  return { omens: pick(OMEN_LIST, open), rituals: pick(RITUAL_LIST, open) };
}

/** Весь контент: сим, бот и тесты играют без ограничений по открытиям. */
export function allContent(): Unlocks {
  return contentPools(() => true);
}

/** Базовый набор без открытий — одинаков для всех (вызов дня, архив, вызов друга). */
export function baseContent(): Unlocks {
  return contentPools(() => false);
}
