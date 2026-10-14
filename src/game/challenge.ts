import { SKIES } from '@/core/content/skies';
import type { RunState } from '@/core/types';
import { num, t } from '@/i18n';

/**
 * «Брось вызов другу»: ссылка с тем же раскладом и итогом бросившего.
 * Параметр запуска Telegram (`startapp`) пропускает только [A-Za-z0-9_-] и не длиннее 64,
 * поэтому всё упаковано в одну строку: `c_<сид>_<небо>_<звёздность>_<глава>_<лучший ход>`,
 * числа — в base36.
 */
export interface Challenge {
  seed: number;
  skyId: string;
  stake: number;
  /** Глава, до которой дошёл бросивший (9 — прошёл все восемь). */
  ante: number;
  /** Его лучший ход. */
  best: number;
}

/** Что пришло в параметре запуска: вызов или метка источника рекламы (`src_<канал>`). */
export interface StartParam {
  challenge?: Challenge;
  source?: string;
}

const MAX_ANTE = 99;

export function challengeOf(run: RunState, won: boolean): Challenge {
  return {
    seed: run.seed,
    skyId: run.skyId,
    stake: run.stake ?? 0,
    ante: won ? 9 : run.ante,
    best: run.stats.bestPlacement,
  };
}

export function encodeChallenge(c: Challenge): string {
  const n = (x: number) => Math.max(0, Math.floor(x)).toString(36);
  return ['c', n(c.seed), c.skyId, n(c.stake), n(Math.min(c.ante, MAX_ANTE)), n(c.best)].join('_');
}

export function parseStartParam(raw: string | null | undefined): StartParam {
  if (!raw || raw.length > 64 || !/^[A-Za-z0-9_-]+$/.test(raw)) return {};
  if (raw.startsWith('src_')) return { source: raw.slice(4, 36) };
  const parts = raw.split('_');
  if (parts[0] !== 'c' || parts.length !== 6) return {};
  const [, seed, skyId, stake, ante, best] = parts as [string, string, string, string, string, string];
  const nums = [seed, stake, ante, best].map((s) => (/^[0-9a-z]{1,8}$/.test(s) ? parseInt(s, 36) : NaN));
  if (nums.some((x) => !Number.isFinite(x)) || !SKIES[skyId]) return {};
  const [s, st, a, b] = nums as [number, number, number, number];
  if (s >= 2 ** 32 || st > 10 || a < 1 || a > MAX_ANTE) return {};
  return { challenge: { seed: s, skyId, stake: st, ante: a, best: b } };
}

/** Кто кого: сначала глава, при равенстве — лучший ход. 1 — побил, 0 — ничья, −1 — нет. */
export function compareToChallenge(c: Pick<Challenge, 'ante' | 'best'>, ante: number, best: number): -1 | 0 | 1 {
  if (ante !== c.ante) return ante > c.ante ? 1 : -1;
  if (best !== c.best) return best > c.best ? 1 : -1;
  return 0;
}

/** «глава 3, лучший ход 480» / «все 8 глав, лучший ход 1 240». */
export function challengeScore(ante: number, best: number): string {
  const reach = ante > 8 ? t('challenge.allChapters') : t('challenge.reached', { ante });
  return t('challenge.score', { reach, best: num(best) });
}
