import { MYTHS, MYTHS_UNLOCK } from '@/core/content/myths';
import { OMEN_LIST } from '@/core/content/omens';
import { RESONANCE_UNLOCK } from '@/core/content/resonance';
import { SKY_LIST, type Unlock } from '@/core/content/skies';
import { MAX_STAKE } from '@/core/content/stakes';
import { TROPHY_LIST, TROPHY_UNLOCK } from '@/core/content/trophies';
import { COLLECTIBLE_COMBOS, isUnlocked, type Profile } from './profile';

/*
 * Достижения «Зала славы» (HF.1): условия считаются по профилю, своего хранилища нет —
 * достижение открыто, пока выполнено условие. Ступень задаёт оправу медальона (как
 * редкость Знамений); настоящую долю игроков приносит сервер (HF.2).
 */

/** Ступень: 0 — обычное, 1 — редкое, 2 — эпическое, 3 — легендарное. */
export type FeatTier = 0 | 1 | 2 | 3;

/** Раздел зала: в каком порядке и под какой подписью идут достижения. */
export type FeatGroup = 'path' | 'move' | 'sky' | 'eclipse' | 'finds' | 'daily';

export interface FeatDef {
  id: string;
  group: FeatGroup;
  tier: FeatTier;
  /** Знак медальона: мотив из «Эмали» (`art/enamel.ts`) и цвет эмали. */
  motif: string;
  fam: string;
  /** Текущее значение и цель; открыто, когда значение дошло до цели. */
  progress(p: Profile): [number, number];
  /** Пока ступень лестницы закрыта, достижение скрыто: новичку не раскрываем мифы и трофеи. */
  hidden?: Unlock;
}

/** Самая длинная серия вызовов дня подряд по архиву. */
export function dailyStreak(p: Profile): number {
  const days = Object.keys(p.archive ?? {}).sort().map((d) => Date.parse(`${d}T00:00:00Z`) / 86_400_000);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1]! === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

const count = (n: number | undefined, goal: number): [number, number] => [Math.min(n ?? 0, goal), goal];
const flag = (on: boolean | undefined): [number, number] => [on ? 1 : 0, 1];
const regularOmens = () => OMEN_LIST.filter((o) => !o.pair);
const legendOmens = () => OMEN_LIST.filter((o) => o.pair);
const has = (list: readonly string[] | undefined, ids: readonly string[]) => ids.filter((id) => list?.includes(id)).length;

export const FEATS: readonly FeatDef[] = [
  // Путь: главы, победы, звёздность
  { id: 'firstRun', group: 'path', tier: 0, motif: 'shortcut', fam: 'silver', progress: (p) => count(p.runs, 1) },
  { id: 'chapter3', group: 'path', tier: 0, motif: 'ladder', fam: 'silver', progress: (p) => count(p.bestAnte, 3) },
  { id: 'chapter6', group: 'path', tier: 1, motif: 'ladder', fam: 'lapis', progress: (p) => count(p.bestAnte, 6) },
  { id: 'firstWin', group: 'path', tier: 2, motif: 'corona', fam: 'gold', progress: (p) => count(p.wins, 1) },
  { id: 'wins10', group: 'path', tier: 2, motif: 'doubleStar', fam: 'gold', progress: (p) => count(p.wins, 10) },
  { id: 'stakeMax', group: 'path', tier: 3, motif: 'supernovaSeed', fam: 'gold', progress: (p) => count(p.maxStake, MAX_STAKE) },
  // Ход: очки одним ходом
  { id: 'move1k', group: 'move', tier: 0, motif: 'starlight', fam: 'star', progress: (p) => count(p.bestPlacement, 1_000) },
  { id: 'move5k', group: 'move', tier: 1, motif: 'twinStars', fam: 'star', progress: (p) => count(p.bestPlacement, 5_000) },
  { id: 'move25k', group: 'move', tier: 2, motif: 'glassCannon', fam: 'wine', progress: (p) => count(p.bestPlacement, 25_000) },
  { id: 'move100k', group: 'move', tier: 3, motif: 'collapsar', fam: 'wine', progress: (p) => count(p.bestPlacement, 100_000) },
  // Небо: созвездия и крест
  { id: 'cross', group: 'sky', tier: 0, motif: 'crossroads', fam: 'malachite', progress: (p) => flag(p.crossFound) },
  { id: 'lines100', group: 'sky', tier: 0, motif: 'constellationMap', fam: 'lapis', progress: (p) => count(p.totalLines, 100) },
  { id: 'lines1000', group: 'sky', tier: 2, motif: 'stardust', fam: 'lapis', progress: (p) => count(p.totalLines, 1_000) },
  { id: 'allCombos', group: 'sky', tier: 1, motif: 'rainbow', fam: 'lapis', progress: (p) => count(has(p.combosFound, COLLECTIBLE_COMBOS), COLLECTIBLE_COMBOS.length) },
  // Затмения и трофеи
  { id: 'eclipse1', group: 'eclipse', tier: 0, motif: 'moonTide', fam: 'moon', progress: (p) => count(p.eclipses, 1) },
  { id: 'eclipses50', group: 'eclipse', tier: 2, motif: 'patientSky', fam: 'moon', progress: (p) => count(p.eclipses, 50) },
  { id: 'tame', group: 'eclipse', tier: 1, motif: 'nightOwl', fam: 'silver', progress: (p) => count(Object.keys(p.tamed ?? {}).length, 1), hidden: TROPHY_UNLOCK },
  { id: 'tameAll', group: 'eclipse', tier: 3, motif: 'echoChamber', fam: 'silver', progress: (p) => count(has(Object.keys(p.tamed ?? {}), TROPHY_LIST.map((x) => x.id)), TROPHY_LIST.length), hidden: TROPHY_UNLOCK },
  // Находки: Знамения, мифы, небеса
  { id: 'omens20', group: 'finds', tier: 0, motif: 'astrologer', fam: 'star', progress: (p) => count(has(p.seenOmens, regularOmens().map((o) => o.id)), 20) },
  { id: 'omensAll', group: 'finds', tier: 2, motif: 'alchemist', fam: 'gold', progress: (p) => { const ids = regularOmens().map((o) => o.id); return count(has(p.seenOmens, ids), ids.length); } },
  { id: 'legendsAll', group: 'finds', tier: 3, motif: 'binary', fam: 'gold', progress: (p) => { const ids = legendOmens().map((o) => o.id); return count(has(p.seenOmens, ids), ids.length); }, hidden: RESONANCE_UNLOCK },
  { id: 'myth1', group: 'finds', tier: 1, motif: 'legend', fam: 'gold', progress: (p) => count(p.mythsFound?.length, 1), hidden: MYTHS_UNLOCK },
  { id: 'mythsAll', group: 'finds', tier: 3, motif: 'legend', fam: 'star', progress: (p) => count(has(p.mythsFound, MYTHS.map((m) => m.id)), MYTHS.length), hidden: MYTHS_UNLOCK },
  { id: 'skiesAll', group: 'finds', tier: 2, motif: 'horizon', fam: 'malachite', progress: (p) => count(has(p.unlockedSkies, SKY_LIST.map((s) => s.id)), SKY_LIST.length) },
  // Вызов дня
  { id: 'daily1', group: 'daily', tier: 0, motif: 'highNoon', fam: 'sun', progress: (p) => count(Object.keys(p.archive ?? {}).length, 1) },
  { id: 'daily7', group: 'daily', tier: 1, motif: 'sunWorship', fam: 'sun', progress: (p) => count(dailyStreak(p), 7) },
  { id: 'dailyWin', group: 'daily', tier: 2, motif: 'corona', fam: 'sun', progress: (p) => flag(Object.values(p.archive ?? {}).some((r) => r.won)) },
  { id: 'daily30', group: 'daily', tier: 3, motif: 'tithe', fam: 'sun', progress: (p) => count(dailyStreak(p), 30) },
];

export const FEAT_GROUPS: readonly FeatGroup[] = ['path', 'move', 'sky', 'eclipse', 'finds', 'daily'];

export interface FeatState {
  def: FeatDef;
  done: boolean;
  /** Скрыто, пока не открыта ступень лестницы. */
  secret: boolean;
  value: number;
  goal: number;
}

export function featStates(p: Profile): FeatState[] {
  return FEATS.map((def) => {
    const [value, goal] = def.progress(p);
    const done = value >= goal;
    return { def, done, secret: !done && !!def.hidden && !isUnlocked(def.hidden, p), value, goal };
  });
}

/** Ближайшее неоткрытое: больше всего пройдено к цели (не скрытое и не флаг «да/нет»). */
export function nearestFeat(states: readonly FeatState[]): FeatState | null {
  const open = states.filter((s) => !s.done && !s.secret && s.goal > 1);
  return open.sort((a, b) => b.value / b.goal - a.value / a.goal)[0] ?? null;
}

/** Рекорды зала: значение из профиля; процентиль приносит сервер. */
export type RecordId = 'bestMove' | 'bestAnte' | 'wins' | 'lines' | 'eclipses' | 'streak';
export const RECORDS: readonly RecordId[] = ['bestMove', 'bestAnte', 'wins', 'lines', 'eclipses', 'streak'];

export function recordValue(p: Profile, id: RecordId): number {
  switch (id) {
    case 'bestMove': return p.bestPlacement;
    case 'bestAnte': return p.bestAnte;
    case 'wins': return p.wins;
    case 'lines': return p.totalLines;
    case 'eclipses': return p.eclipses ?? 0;
    case 'streak': return dailyStreak(p);
  }
}

/**
 * Доли игроков с сервера (HF.2): `feats` — процент игроков с достижением, `records` —
 * процент игроков, у которых рекорд ниже твоего. Нет связи — зал показывает только своё.
 */
export interface HallStats {
  players: number;
  feats: Record<string, number>;
  /** Пороги рекорда по процентилям 0…100 (101 значение) — процент считается на клиенте. */
  records: Partial<Record<RecordId, number[]>>;
}

/** Какой доле игроков рекорд уступает: по порогам процентилей. */
export function percentileOf(thresholds: readonly number[] | undefined, value: number): number | null {
  if (!thresholds?.length || value <= 0) return null;
  let i = 0;
  while (i < thresholds.length && thresholds[i]! < value) i++;
  return Math.max(0, Math.min(99, Math.round((i / thresholds.length) * 100)));
}
