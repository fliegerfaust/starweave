import { traitOf } from './content/traits';
import { cardSuits } from './deck';
import type { Card, ComboId } from './types';
import { COMBO_IDS, SUITS } from './types';

export interface ComboOptions {
  flushSlack: number;
  straightGaps: number;
  /** Россыпь засчитывается Парой (трофей «Помилование»). */
  scatterAsPair?: boolean;
}

export const DEFAULT_COMBO_OPTIONS: ComboOptions = { flushSlack: 0, straightGaps: 0 };

export interface ComboFeatures {
  maxOfKind: number;
  pairs: number;
  flush: boolean;
  straight: boolean;
  ordered: boolean;
  mirror: boolean;
}

/**
 * Разбирает линию (карты в порядке чтения) на признаки. `extra` — ранги, которые считаются
 * только для пар и троек: второй ранг Двойника.
 */
export function comboFeatures(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS, extra: readonly number[] = []): ComboFeatures {
  const n = cards.length;
  const ranks = cards.map((c) => c.rank);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const kinds = new Map(counts);
  for (const r of extra) kinds.set(r, (kinds.get(r) ?? 0) + 1);
  const maxOfKind = Math.max(0, ...kinds.values());
  const pairs = [...kinds.values()].filter((v) => v >= 2).length;

  const flushNeed = Math.max(Math.min(n, 3), n - opts.flushSlack);
  const flush = n >= 3 && SUITS.some((s) => cards.filter((c) => cardSuits(c).includes(s)).length >= flushNeed);

  const distinct = counts.size === n;
  const span = n > 0 ? Math.max(...ranks) - Math.min(...ranks) : 0;
  const straight = n >= 3 && distinct && span - (n - 1) <= opts.straightGaps;

  let ordered = false;
  if (straight) {
    const inc = ranks.every((r, i) => i === 0 || r > (ranks[i - 1] as number));
    const dec = ranks.every((r, i) => i === 0 || r < (ranks[i - 1] as number));
    ordered = inc || dec;
  }

  const mirror = n >= 4 && maxOfKind < n && ranks.every((r, i) => r === ranks[n - 1 - i]);

  return { maxOfKind, pairs, flush, straight, ordered, mirror };
}

/** Созвездие по признакам. Порядок проверок — иерархия силы. */
function comboOf(f: ComboFeatures): ComboId {
  if (f.ordered && f.flush) return 'supernova';
  if (f.straight && f.flush) return 'starFlush';
  if (f.maxOfKind >= 4) return 'quartet';
  if (f.ordered) return 'cascade';
  if (f.flush) return 'flush';
  if (f.straight) return 'straight';
  if (f.mirror) return 'mirror';
  if (f.maxOfKind >= 3) return 'triple';
  if (f.pairs >= 2) return 'twoPair';
  if (f.pairs >= 1) return 'pair';
  return 'scatter';
}

/** Линия, как она вспыхнет: созвездие и ранг каждой карты (Туманность встаёт выгоднее). */
export interface ResolvedLine {
  combo: ComboId;
  ranks: number[];
}

/**
 * Лучшее созвездие линии. Карты с выбором ранга (Двойник, Туманность) перебираются: берётся
 * сильнейшее созвездие, при равенстве — больше света. Второй ранг Двойника идёт в пары и тройки.
 */
export function resolveLine(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): ResolvedLine {
  const line = resolveRanks(cards, opts);
  return opts.scatterAsPair && line.combo === 'scatter' ? { ...line, combo: 'pair' } : line;
}

function resolveRanks(cards: readonly Card[], opts: ComboOptions): ResolvedLine {
  const choices = cards.map((c) => traitOf(c)?.ranks?.(c) ?? null);
  if (choices.every((ch) => !ch)) return { combo: comboOf(comboFeatures(cards, opts)), ranks: cards.map((c) => c.rank) };
  let best: ResolvedLine | null = null;
  let bestSum = -1;
  const ranks = cards.map((c) => c.rank);
  const walk = (i: number): void => {
    if (i === cards.length) {
      const variant = cards.map((c, j) => (ranks[j] === c.rank ? c : { ...c, rank: ranks[j]! }));
      const extra = choices.flatMap((ch, j) => (ch?.both ? ch.options.filter((r) => r !== ranks[j]) : []));
      const combo = comboOf(comboFeatures(variant, opts, extra));
      const sum = ranks.reduce((a, b) => a + b, 0);
      const better = !best || COMBO_IDS.indexOf(combo) > COMBO_IDS.indexOf(best.combo) || (combo === best.combo && sum > bestSum);
      if (better) {
        best = { combo, ranks: [...ranks] };
        bestSum = sum;
      }
      return;
    }
    for (const r of choices[i]?.options ?? [cards[i]!.rank]) {
      ranks[i] = r;
      walk(i + 1);
    }
  };
  walk(0);
  return best!;
}

/** Лучшее созвездие линии. */
export function evaluateCombo(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): ComboId {
  return resolveLine(cards, opts).combo;
}
