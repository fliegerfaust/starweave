import { contentPools, type Unlocks } from '@/core/content/pools';
import type { GameEvent, RunState } from '@/core/types';
import { isUnlocked, markDailyStarted, markOmensSeen, markSeen, markTamed, recordDiscoveries, recordMyths, recordProgress, recordRunEnd, unrecordRunEnd, type Discovery, type Profile } from './profile';
import { findKeys } from './collection';

/**
 * Что случилось в забеге и важно профилю (TD.8). Всё, что открывает небеса, Знамения в
 * Кодексе и созвездия коллекции, приходит сюда событием — из контроллера забега, а не из
 * экранов. Бот и сим подают те же события и видят те же открытия.
 */
export type ProgressEvent =
  | { e: 'runStart' }
  /** Ночь началась: её Затмение и Знамения забега — встречены. */
  | { e: 'nightStart' }
  /** Ход сыгран: вспыхнувшие созвездия — в коллекцию. */
  | { e: 'turn'; events: readonly GameEvent[] }
  /** Знамения показаны в Обсерватории или пакете — открыты для Кодекса. */
  | { e: 'omensShown'; ids: readonly string[] }
  /** Трофей Затмения взят вместо Знамения — в коллекцию трофеев (TR.4). */
  | { e: 'tamed'; bossId: string }
  /** Глава пройдена (вышли из Обсерватории дальше по забегу). */
  | { e: 'progress' }
  | { e: 'runEnd'; won: boolean }
  /** Второй шанс: записанное поражение отменяется. */
  | { e: 'revived' };

/** Что из события вышло: впервые открытые небеса, находки коллекции, изменился ли профиль. */
export interface ProgressResult {
  skies: string[];
  discovery: Discovery | null;
  changed: boolean;
}

const nothing = (): ProgressResult => ({ skies: [], discovery: null, changed: false });

/**
 * Единственная точка записи прогресса в профиль. Учебный забег прогресса не даёт — только
 * встречи: увиденные в нём Знамения и Затмения открыты в Кодексе.
 */
export function recordEvent(p: Profile, run: RunState, ev: ProgressEvent): ProgressResult {
  if (run.tutorial && ev.e !== 'nightStart' && ev.e !== 'omensShown') return nothing();
  switch (ev.e) {
    case 'runStart':
      if (run.daily && !run.archive) markDailyStarted(p);
      run.foundBefore = findKeys(p);
      return { ...nothing(), changed: true };
    case 'nightStart':
      markSeen(p, run);
      return { ...nothing(), changed: true };
    case 'turn': {
      const found: Discovery = { combos: [], cross: false, myths: [] };
      // Побеждённое Затмение — к ступени «Небесные тела»
      const eclipse = !!run.night?.bossId && ev.events.some((e) => e.t === 'nightWon');
      if (eclipse) p.eclipses = (p.eclipses ?? 0) + 1;
      for (const e of ev.events) {
        if (e.t !== 'ignite') continue;
        const d = recordDiscoveries(p, e.score.lines.map((l) => l.combo), e.score.lines.length);
        found.combos.push(...d.combos);
        found.cross ||= d.cross;
        found.myths.push(...recordMyths(p, e.score.myths.map((m) => m.myth)));
      }
      const any = found.combos.length > 0 || found.cross || found.myths.length > 0;
      return { skies: [], discovery: any ? found : null, changed: any || eclipse };
    }
    case 'omensShown':
      return { ...nothing(), changed: markOmensSeen(p, [...ev.ids]) };
    case 'tamed':
      markTamed(p, ev.bossId);
      return { ...nothing(), changed: true };
    case 'progress':
      return { ...nothing(), skies: recordProgress(p, run), changed: true };
    case 'runEnd':
      return { ...nothing(), skies: recordRunEnd(p, run, ev.won), changed: true };
    case 'revived':
      unrecordRunEnd(p, run);
      return { ...nothing(), changed: true };
  }
}

/**
 * Снимок открытий для нового забега. `shared` — вызов дня, архив, вызов друга: базовый
 * набор, одинаковый у всех, иначе сравнивать итоги нечестно. `owned` — покупки площадки.
 */
export function unlocksFor(p: Profile, shared: boolean, owned: ReadonlySet<string> = new Set()): Unlocks {
  return contentPools((unlock) => !shared && isUnlocked(unlock, p, owned), shared);
}
