import { BOSS_LIST } from '@/core/content/bosses';
import { MYTHS, MYTHS_UNLOCK } from '@/core/content/myths';
import { OMEN_LIST } from '@/core/content/omens';
import { RESONANCE_UNLOCK } from '@/core/content/resonance';
import { SKY_LIST } from '@/core/content/skies';
import { COLLECTIBLE_COMBOS, isUnlocked, type Profile } from './profile';

/** Находка Коллекции: что показать знаком на главной. */
export type Find = { kind: 'omen' | 'legend' | 'boss' | 'myth'; id: string };

export interface CollectionTally {
  found: number;
  total: number;
  /** Звёздный каталог — только со ступени «Мифы». */
  myths: { found: string[]; total: number } | null;
  /** Последние находки, новые первыми. */
  recent: Find[];
}

/**
 * Счёт Коллекции (CL.1): созвездия, Знамения, Затмения и небеса, а мифы и легендарные —
 * с их ступени лестницы. Закрытое игроку не входит в «из N»: новичок видит честный счёт.
 */
export function collectionTally(p: Profile): CollectionTally {
  const regular = OMEN_LIST.filter((x) => !x.pair);
  const legends = OMEN_LIST.filter((x) => x.pair);
  const mythsOpen = isUnlocked(MYTHS_UNLOCK, p);
  const legendsOpen = isUnlocked(RESONANCE_UNLOCK, p);
  const seenOmens = p.seenOmens.filter((id) => regular.some((x) => x.id === id));
  const seenLegends = p.seenOmens.filter((id) => legends.some((x) => x.id === id));
  const seenBosses = p.seenBosses.filter((id) => BOSS_LIST.some((x) => x.id === id));
  const myths = (p.mythsFound ?? []).filter((id) => MYTHS.some((m) => m.id === id));
  const combos = (p.combosFound ?? []).filter((id) => COLLECTIBLE_COMBOS.includes(id));
  const skies = p.unlockedSkies.filter((id) => SKY_LIST.some((s) => s.id === id));
  let found = combos.length + seenOmens.length + seenBosses.length + skies.length;
  let total = COLLECTIBLE_COMBOS.length + regular.length + BOSS_LIST.length + SKY_LIST.length;
  if (mythsOpen) {
    found += myths.length;
    total += MYTHS.length;
  }
  if (legendsOpen) {
    found += seenLegends.length;
    total += legends.length;
  }
  // Списки пополняются по мере находок: конец списка — самое новое
  const last = <T>(list: T[], n: number) => list.slice(-n).reverse();
  const recent: Find[] = [
    ...(mythsOpen ? last(myths, 2).map((id) => ({ kind: 'myth' as const, id })) : []),
    ...(legendsOpen ? last(seenLegends, 1).map((id) => ({ kind: 'legend' as const, id })) : []),
    ...last(seenBosses, 1).map((id) => ({ kind: 'boss' as const, id })),
    ...last(seenOmens, 5).map((id) => ({ kind: 'omen' as const, id })),
  ];
  return { found, total, myths: mythsOpen ? { found: myths, total: MYTHS.length } : null, recent };
}
