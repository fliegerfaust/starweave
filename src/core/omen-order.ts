import { omenDef } from './content/omens';
import type { OmenInstance } from './types';

/**
 * Знамения срабатывают слева направо, поэтому «×» выгоднее ставить после всех, кто
 * прибавляет свет или множитель: (10 + 4) × 2 больше, чем 10 × 2 + 4. Возвращает первую
 * пару, где умножающее стоит раньше прибавляющего, — для подсказки новичкам.
 */
export function misorderedOmens(omens: readonly OmenInstance[]): { xmult: string; additive: string } | null {
  for (let i = 0; i < omens.length; i++) {
    if (omenDef(omens[i]!.id).kind !== 'xmult') continue;
    const later = omens.slice(i + 1).find((o) => {
      const kind = omenDef(o.id).kind;
      return kind === 'light' || kind === 'mult';
    });
    if (later) return { xmult: omens[i]!.id, additive: later.id };
  }
  return null;
}
