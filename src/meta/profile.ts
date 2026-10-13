import { SKY_LIST, type Unlock } from '@/core/content/skies';
import { MAX_STAKE } from '@/core/content/stakes';
import { hashSeed } from '@/core/rng';
import type { RunState } from '@/core/types';
import { KEYS, storage } from './storage';

export interface DailyRecord {
  date: string;
  ante: number;
  best: number;
  finished: boolean;
}

/** Лучший итог вызова за день — для архива атласа. */
export interface ArchiveRecord {
  ante: number;
  best: number;
  /** Прошёл все восемь созвездий. */
  won?: boolean;
}

export interface Profile {
  version: 1;
  runs: number;
  wins: number;
  bestAnte: number;
  bestPlacement: number;
  totalLines: number;
  seenOmens: string[];
  seenBosses: string[];
  unlockedSkies: string[];
  tutorial: string[];
  daily: DailyRecord | null;
  /** Итоги вызовов по датам: и сыгранных в свой день, и из архива. */
  archive?: Record<string, ArchiveRecord>;
  /** Наибольшая открытая звёздность. */
  maxStake: number;
  tutorialDone: boolean;
  /** Обучение пройдено до конца (не пропущено) — короткие подсказки не нужны. */
  tutorialFinished?: boolean;
}

export function emptyProfile(): Profile {
  return {
    version: 1,
    runs: 0,
    wins: 0,
    bestAnte: 0,
    bestPlacement: 0,
    totalLines: 0,
    seenOmens: [],
    seenBosses: [],
    unlockedSkies: ['classic'],
    tutorial: [],
    daily: null,
    maxStake: 0,
    tutorialDone: false,
  };
}

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(storage.get(KEYS.profile) ?? 'null') as Profile | null;
    if (p?.version === 1) return { ...emptyProfile(), ...p };
  } catch {
    /* битый профиль — начинаем заново */
  }
  return emptyProfile();
}

export function saveProfile(p: Profile): void {
  storage.set(KEYS.profile, JSON.stringify(p));
}

export function isUnlocked(unlock: Unlock, p: Profile): boolean {
  switch (unlock.kind) {
    case 'default':
      return true;
    case 'reachAnte':
      return p.bestAnte >= unlock.ante;
    case 'winRun':
      return p.wins > 0;
    case 'linesTotal':
      return p.totalLines >= unlock.lines;
  }
}

/** Пересчитывает открытые небеса; возвращает только что открытые. */
export function refreshUnlocks(p: Profile): string[] {
  const fresh: string[] = [];
  for (const sky of SKY_LIST) {
    if (!p.unlockedSkies.includes(sky.id) && isUnlocked(sky.unlock, p)) {
      p.unlockedSkies.push(sky.id);
      fresh.push(sky.id);
    }
  }
  return fresh;
}

export function markSeen(p: Profile, run: RunState): void {
  for (const o of run.omens) if (!p.seenOmens.includes(o.id)) p.seenOmens.push(o.id);
  const boss = run.night?.bossId;
  if (boss && !p.seenBosses.includes(boss)) p.seenBosses.push(boss);
}

/** Знамения, встреченные в Обсерватории, считаются открытыми для Кодекса. */
export function markOmensSeen(p: Profile, ids: string[]): boolean {
  let changed = false;
  for (const id of ids) {
    if (!p.seenOmens.includes(id)) {
      p.seenOmens.push(id);
      changed = true;
    }
  }
  return changed;
}

/** Итог забега в профиль. Возвращает открытые небеса. */
export function recordRunEnd(p: Profile, run: RunState, won: boolean): string[] {
  // Забег мог уже быть записан (победа, затем бесконечный режим) — второй раз не считаем
  const already = run.recordedLines !== undefined;
  if (!already) {
    p.runs += 1;
    if (won) p.wins += 1;
  }
  if (won) p.maxStake = Math.max(p.maxStake, Math.min(MAX_STAKE, (run.stake ?? 0) + 1));
  p.bestAnte = Math.max(p.bestAnte, run.ante);
  p.bestPlacement = Math.max(p.bestPlacement, run.stats.bestPlacement);
  p.totalLines += run.stats.linesIgnited - (run.recordedLines ?? 0);
  run.recordedLines = run.stats.linesIgnited;
  if (run.daily) {
    const date = run.dailyDate ?? todayKey();
    if (!run.archive) {
      const prev = p.daily?.date === date ? p.daily : null;
      p.daily = {
        date,
        ante: Math.max(prev?.ante ?? 0, run.ante),
        best: Math.max(prev?.best ?? 0, run.stats.bestPlacement),
        finished: true,
      };
    }
    recordArchive(p, date, run.ante, run.stats.bestPlacement, won);
  }
  return refreshUnlocks(p);
}

function recordArchive(p: Profile, date: string, ante: number, best: number, won: boolean): void {
  const archive = (p.archive ??= {});
  const prev = archive[date];
  archive[date] = {
    ante: Math.max(prev?.ante ?? 0, ante),
    best: Math.max(prev?.best ?? 0, best),
    ...(won || prev?.won ? { won: true } : {}),
  };
}

/** Отмена записи поражения: забег продолжился после «второго шанса». */
export function unrecordRunEnd(p: Profile, run: RunState): void {
  if (run.recordedLines === undefined) return;
  p.runs = Math.max(0, p.runs - 1);
  p.totalLines = Math.max(0, p.totalLines - run.recordedLines);
  delete run.recordedLines;
  if (run.daily && !run.archive && p.daily) p.daily.finished = false;
}

/** Вызов дня начат: вторая попытка за день не даётся. */
export function markDailyStarted(p: Profile): void {
  const date = todayKey();
  if (p.daily?.date !== date) p.daily = { date, ante: 0, best: 0, finished: false };
}

export function dailyTaken(p: Profile): boolean {
  return p.daily?.date === todayKey();
}

/** Прогресс по ходу забега (дошёл до созвездия — уже засчитано, даже если вкладку закроют). */
export function recordProgress(p: Profile, run: RunState): string[] {
  p.bestAnte = Math.max(p.bestAnte, run.ante);
  markSeen(p, run);
  return refreshUnlocks(p);
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(date = todayKey()): number {
  return hashSeed(`starweave-daily-${date}`);
}

/** Первый вызов дня — с него начинается архив. */
export const FIRST_DAILY = '2026-10-01';

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Номер дня с запуска — для строки шеринга. */
export function dailyNumber(date: Date | string = new Date()): number {
  const key = typeof date === 'string' ? date : todayKey(date);
  return Math.max(1, Math.round((keyToUtc(key) - keyToUtc(FIRST_DAILY)) / 86400000) + 1);
}

/** Прошедшие вызовы дня, от вчерашнего к первому. */
export function archiveDates(today = todayKey()): string[] {
  const out: string[] = [];
  const first = keyToUtc(FIRST_DAILY);
  for (let at = keyToUtc(today) - 86400000; at >= first; at -= 86400000) out.push(new Date(at).toISOString().slice(0, 10));
  return out;
}
