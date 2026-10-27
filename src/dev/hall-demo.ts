import { BOSS_LIST } from '@/core/content/bosses';
import { OMEN_LIST } from '@/core/content/omens';
import { FEATS, type HallStats, type RecordId } from '@/meta/achievements';
import type { Profile } from '@/meta/profile';

/*
 * Витрина HF.0: профиль опытного игрока (или после первого забега) и доли игроков, похожие
 * на настоящие, — пока сервер их не считает (HF.2). Только для DEV.
 */

/** Доля игроков с достижением по ступени: обычные — у многих, легендарные — меньше 1%. */
const TIER_PCT = [[58, 92], [14, 42], [2.2, 8.6], [0.3, 0.9]] as const;

/** Пороги рекорда по процентилям: медиана и «хвост» лучших. */
function thresholds(median: number, top: number): number[] {
  return Array.from({ length: 101 }, (_, q) => {
    const x = q / 100;
    return Math.round(x < 0.5 ? median * (x / 0.5) ** 1.6 : median * (top / median) ** ((x - 0.5) / 0.5) ** 1.4);
  });
}

const day = (n: number) => new Date(Date.UTC(2026, 9, 28 - n)).toISOString().slice(0, 10);

export function hallDemo(p: Profile, fresh: boolean): HallStats {
  const regular = OMEN_LIST.filter((o) => !o.pair).map((o) => o.id);
  Object.assign(p, fresh
    ? { tutorialDone: true, tutorialFinished: true, runs: 1, wins: 0, eclipses: 0, bestAnte: 2, bestPlacement: 640, totalLines: 21, combosFound: ['pair', 'flush', 'straight'], seenOmens: regular.slice(0, 4), seenBosses: [], mythsFound: [], archive: {}, maxStake: 0, crossFound: false, tamed: {}, unlockedSkies: ['classic'] }
    : {
        tutorialDone: true, tutorialFinished: true, runs: 23, wins: 3, bestAnte: 8, bestPlacement: 4820, totalLines: 412, eclipses: 31, maxStake: 2, crossFound: true,
        combosFound: ['pair', 'flush', 'straight', 'twoPair', 'triple', 'quartet', 'mirror'],
        seenOmens: [...regular.slice(0, 28), ...OMEN_LIST.filter((o) => o.pair).slice(0, 2).map((o) => o.id)],
        seenBosses: BOSS_LIST.slice(0, 9).map((b) => b.id), tamed: { [BOSS_LIST[0]!.id]: 2, [BOSS_LIST[3]!.id]: 1 },
        mythsFound: ['cassiopeia', 'cygnus', 'lyra'], unlockedSkies: ['classic', 'twins', 'wanderer'],
        archive: Object.fromEntries([0, 1, 2, 3, 4, 6, 7, 9].map((n, i) => [day(n), { ante: 3 + (i % 5), best: 900 + i * 310, ...(i === 2 ? { won: true } : {}) }])),
      });
  const feats: Record<string, number> = {};
  FEATS.forEach((f, i) => {
    const [lo, hi] = TIER_PCT[f.tier];
    feats[f.id] = lo + ((i * 0.37) % 1) * (hi - lo);
  });
  const records: Record<RecordId, number[]> = {
    bestMove: thresholds(1_100, 60_000),
    bestAnte: thresholds(3, 8),
    wins: thresholds(0, 12),
    lines: thresholds(120, 3_000),
    eclipses: thresholds(4, 120),
    streak: thresholds(1, 21),
  };
  return { players: 18_420, feats, records };
}
