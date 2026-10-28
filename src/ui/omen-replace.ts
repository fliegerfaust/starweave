import { sellPrice } from '@/core/shop';
import type { OmenInstance, RunState } from '@/core/types';

/**
 * Замена Знамения при полном ряде (OB, отзыв Андрея 28.10, вариант Б — выбор Дениса 29.10): своё
 * продаётся, новое встаёт на его место. Ряд своих Знамений становится целью: над медалями цена
 * продажи, тусклые — не по карману.
 */

/** Сколько золота станет после замены: `null` — без цены (пакет, трофей), меньше нуля — не хватает. */
export function goldAfter(run: RunState, o: OmenInstance, price: number | null): number | null {
  return price === null ? null : run.gold + sellPrice(o.id) - price;
}

/** Хватит ли золота хоть на одну замену. */
export function canReplaceFor(run: RunState, price: number): boolean {
  return run.omens.some((o) => (goldAfter(run, o, price) ?? 0) >= 0);
}
