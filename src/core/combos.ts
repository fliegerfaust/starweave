import { cardSuits } from './deck';
import type { Card, ComboId } from './types';
import { SUITS } from './types';

export interface ComboOptions {
  flushSlack: number;
  straightGaps: number;
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

/** Разбирает линию (карты в порядке чтения) на признаки. */
export function comboFeatures(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): ComboFeatures {
  const n = cards.length;
  const ranks = cards.map((c) => c.rank);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const maxOfKind = Math.max(0, ...counts.values());
  const pairs = [...counts.values()].filter((v) => v >= 2).length;

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

/** Лучшее созвездие линии. Порядок проверок — иерархия силы. */
export function evaluateCombo(cards: readonly Card[], opts: ComboOptions = DEFAULT_COMBO_OPTIONS): ComboId {
  const f = comboFeatures(cards, opts);
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
