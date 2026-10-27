import { BOSS_LIST } from '@/core/content/bosses';
import { MYTHS, MYTHS_UNLOCK } from '@/core/content/myths';
import { OMEN_LIST } from '@/core/content/omens';
import { RESONANCE_UNLOCK } from '@/core/content/resonance';
import { SKY_LIST, type Unlock } from '@/core/content/skies';
import { TROPHY_UNLOCK } from '@/core/content/trophies';
import { COLLECTIBLE_COMBOS, isUnlocked, type Profile } from './profile';

/** Находка Коллекции: что показать знаком на главной. */
export type Find = { kind: 'omen' | 'legend' | 'boss' | 'myth'; id: string };

/**
 * Ближайшее открытие: ступень лестницы, до которой осталось меньше всего, а когда все
 * ступени открыты — ещё не найденный миф каталога.
 */
export type NextFind = { kind: 'step'; id: 'myths' | 'trophies' | 'resonance'; left: number } | { kind: 'myth'; id: string; left: number };

export interface CollectionTally {
  found: number;
  total: number;
  /** Последние находки, новые первыми. */
  recent: Find[];
  next: NextFind | null;
}

/** Сколько осталось до ступени; 0 — уже открыта. */
function stepLeft(unlock: Unlock, p: Profile): number {
  if (isUnlocked(unlock, p)) return 0;
  switch (unlock.kind) {
    case 'combos': return unlock.count - (p.combosFound?.length ?? 0);
    case 'eclipses': return unlock.count - (p.eclipses ?? 0);
    case 'omensSeen': return unlock.count - p.seenOmens.length;
    default: return 0;
  }
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
  const steps = ([['myths', MYTHS_UNLOCK], ['trophies', TROPHY_UNLOCK], ['resonance', RESONANCE_UNLOCK]] as const)
    .map(([id, unlock]) => ({ kind: 'step' as const, id, left: stepLeft(unlock, p) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => a.left - b.left);
  const unfound = MYTHS.filter((m) => !myths.includes(m.id));
  const next: NextFind | null = steps[0] ?? (unfound.length ? { kind: 'myth', id: unfound[0]!.id, left: unfound.length } : null);
  return { found, total, recent, next };
}
