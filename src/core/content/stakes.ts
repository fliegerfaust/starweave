import type { NightKind, RunState } from '../types';
import { NIGHT_REWARD, nightTarget } from './balance';
import { bossDef } from './bosses';

/** Звёздность — уровни сложности после победы. Эффекты накапливаются. */
export const MAX_STAKE = 5;

export interface StakeEffects {
  targetScale: number;
  moves: number;
  burns: number;
  reward: number;
  price: number;
}

export function stakeEffects(stake: number): StakeEffects {
  return {
    targetScale: stake >= 5 ? 1.5 : stake >= 1 ? 1.25 : 1,
    moves: stake >= 2 ? -2 : 0,
    reward: stake >= 3 ? -1 : 0,
    price: stake >= 4 ? 1 : 0,
    burns: stake >= 5 ? -1 : 0,
  };
}

/** Цель ночи с учётом Затмения и звёздности. */
export function runNightTarget(run: RunState, kind: NightKind, bossId: string | null): number {
  const bossScale = bossId ? (bossDef(bossId).targetScale ?? 1) : 1;
  return nightTarget(run.ante, kind, bossScale * stakeEffects(run.stake ?? 0).targetScale);
}

export function runNightReward(run: RunState, kind: NightKind): number {
  return Math.max(1, NIGHT_REWARD[kind] + stakeEffects(run.stake ?? 0).reward);
}

export function stakePrice(run: RunState, base: number): number {
  return base + stakeEffects(run.stake ?? 0).price;
}
