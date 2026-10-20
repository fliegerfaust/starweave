import { SKY_LIST, type Unlock } from '@/core/content/skies';
import { MAX_STAKE } from '@/core/content/stakes';
import { hashSeed } from '@/core/rng';
import type { TutorialGift } from '@/core/run';
import { COMBO_IDS, type ComboId, type RunState } from '@/core/types';
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
  /** Коллекция: созвездия, которые игрок хоть раз собрал (кроме Россыпи). */
  combosFound?: ComboId[];
  /** Первый крест уже был. */
  crossFound?: boolean;
  /** Золото и Знамения пройденного обучения — ждут первого забега. */
  tutorialGift?: TutorialGift;
  /** Когда игрок впервые открыл игру (мс): первые сутки без межстраничной рекламы. */
  firstSeen?: number;
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
    firstSeen: Date.now(),
  };
}

/** Текущая версия профиля. Новая версия — шаг в `PROFILE_MIGRATIONS` и тест на старый JSON. */
export const PROFILE_VERSION = 1;

/**
 * Шаги миграции: `n` переводит профиль версии `n` в `n + 1`. Профили 0.5.x — версия 1,
 * поэтому пока шагов нет; добавленные позже поля заполняет `sanitizeProfile` значениями
 * по умолчанию.
 */
const PROFILE_MIGRATIONS: Record<number, (p: Record<string, unknown>) => void> = {};

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def);
const strs = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 64))] : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Профиль из сырых данных (TD.1): каждое поле проверяется по типу, неверное заменяется
 * значением по умолчанию — `seenOmens: null` из облака или старой сборки больше не роняет игру.
 */
export function sanitizeProfile(p: Raw): Profile {
  const base = emptyProfile();
  const out: Profile = {
    ...base,
    runs: num(p.runs, 0),
    wins: num(p.wins, 0),
    bestAnte: num(p.bestAnte, 0),
    bestPlacement: num(p.bestPlacement, 0),
    totalLines: num(p.totalLines, 0),
    seenOmens: strs(p.seenOmens),
    seenBosses: strs(p.seenBosses),
    unlockedSkies: strs(p.unlockedSkies).length ? strs(p.unlockedSkies) : base.unlockedSkies,
    tutorial: strs(p.tutorial),
    daily: null,
    maxStake: Math.min(MAX_STAKE, num(p.maxStake, 0)),
    tutorialDone: p.tutorialDone === true,
    // Профили до 0.5.8 без даты: игравшие — давно с нами, остальные — с этой минуты
    firstSeen: typeof p.firstSeen === 'number' ? p.firstSeen : num(p.runs, 0) > 0 ? 0 : Date.now(),
  };
  if (!out.unlockedSkies.includes('classic')) out.unlockedSkies.unshift('classic');
  const d = p.daily;
  if (isObj(d) && typeof d.date === 'string' && DATE.test(d.date)) {
    out.daily = { date: d.date, ante: num(d.ante, 0), best: num(d.best, 0), finished: d.finished === true };
  }
  if (isObj(p.archive)) {
    const archive: Record<string, ArchiveRecord> = {};
    for (const [date, r] of Object.entries(p.archive)) {
      if (!DATE.test(date) || !isObj(r)) continue;
      archive[date] = { ante: num(r.ante, 0), best: num(r.best, 0), ...(r.won === true ? { won: true } : {}) };
    }
    out.archive = archive;
  }
  if (p.tutorialFinished === true) out.tutorialFinished = true;
  const combos = strs(p.combosFound).filter((id): id is ComboId => (COMBO_IDS as readonly string[]).includes(id));
  if (combos.length) out.combosFound = combos;
  if (p.crossFound === true) out.crossFound = true;
  if (isObj(p.tutorialGift)) out.tutorialGift = { gold: num(p.tutorialGift.gold, 0) };
  return out;
}

/** Версия профиля, лежащего в хранилище (или null). */
function storedVersion(): number | null {
  try {
    const p = JSON.parse(storage.get(KEYS.profile) ?? 'null') as unknown;
    return isObj(p) && typeof p.version === 'number' ? p.version : null;
  } catch {
    return null;
  }
}

/**
 * Читает профиль: старые версии мигрируют по шагам, поля проверяются. Профиль новее этой
 * сборки (облако от свежей версии игры) читается насколько понятен, но не перезаписывается
 * — см. `saveProfile`.
 */
export function loadProfile(): Profile {
  try {
    const p = JSON.parse(storage.get(KEYS.profile) ?? 'null') as unknown;
    if (isObj(p) && typeof p.version === 'number' && p.version >= 1) {
      for (let v = p.version; v < PROFILE_VERSION; v++) PROFILE_MIGRATIONS[v]?.(p);
      return sanitizeProfile(p);
    }
  } catch {
    /* битый профиль — начинаем заново */
  }
  return emptyProfile();
}

export function saveProfile(p: Profile): void {
  // Профиль из более новой версии игры не затираем: иначе старая сборка на втором устройстве
  // стёрла бы его и в облаке
  const stored = storedVersion();
  if (stored !== null && stored > PROFILE_VERSION) return;
  storage.set(KEYS.profile, JSON.stringify(p));
}

/**
 * Открыта ли колода неба. Колоды атласа открывает покупка (`owned` — купленное на этой
 * площадке), остальные — достижения профиля.
 */
export function isUnlocked(unlock: Unlock, p: Profile, owned: ReadonlySet<string> = new Set()): boolean {
  switch (unlock.kind) {
    case 'atlas':
      return owned.has('atlas');
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
    // Колоды атласа не записываются в профиль: они открыты, пока атлас куплен
    if (sky.unlock.kind !== 'atlas' && !p.unlockedSkies.includes(sky.id) && isUnlocked(sky.unlock, p)) {
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

/** Созвездия коллекции — все, кроме Россыпи («ничего не совпало» нечего собирать). */
export const COLLECTIBLE_COMBOS: readonly ComboId[] = COMBO_IDS.filter((id) => id !== 'scatter');

/** Что впервые случилось за ход: новые созвездия коллекции и первый крест. */
export interface Discovery {
  combos: ComboId[];
  cross: boolean;
}

/** Записывает вспыхнувшие созвездия в коллекцию; возвращает то, что открыто впервые. */
export function recordDiscoveries(p: Profile, combos: readonly ComboId[], lines: number): Discovery {
  const found = (p.combosFound ??= []);
  const fresh: ComboId[] = [];
  for (const id of combos) {
    if (COLLECTIBLE_COMBOS.includes(id) && !found.includes(id) && !fresh.includes(id)) fresh.push(id);
  }
  found.push(...fresh);
  const cross = lines >= 2 && !p.crossFound;
  if (cross) p.crossFound = true;
  return { combos: fresh, cross };
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
