import { TROPHY_SLOTS, trophyDef } from './content/trophies';
import { RuleError } from './errors';
import { createOmen } from './omen-instance';
import { omenSlots } from './shop';
import type { RunState } from './types';

/**
 * Вариант выбора после Затмения (TR.1): приручить Затмение (`id` — Затмения) или взять его
 * парное Знамение (`id` — Знамения).
 */
export type TrophyOffer = { k: 'trophy'; id: string } | { k: 'omen'; id: string };

/** Приручённые Затмения забега (в старых сохранениях поля нет). */
export function trophiesOf(run: RunState): string[] {
  return run.trophies ?? [];
}

/**
 * Варианты после победы над Затмением `bossId`: трофей и его парное Знамение. Знамение,
 * которое уже есть у игрока, не предлагается — остаётся только трофей.
 */
export function rollTrophy(run: RunState, bossId: string): TrophyOffer[] {
  const omen = trophyDef(bossId).omen;
  const owned = run.omens.some((o) => o.id === omen);
  return owned ? [{ k: 'trophy', id: bossId }] : [{ k: 'trophy', id: bossId }, { k: 'omen', id: omen }];
}

/** Можно ли взять вариант: Знамению нужен свободный слот, трофей встаёт всегда. */
export function canTakeTrophy(run: RunState, offer: TrophyOffer): boolean {
  return offer.k === 'trophy' || run.omens.length < omenSlots(run);
}

/** Взять вариант: трофей занимает слот (новый вытесняет самый старый) или Знамение — в пояс. */
export function takeTrophy(run: RunState, offer: TrophyOffer): void {
  if (!canTakeTrophy(run, offer)) throw new RuleError('noSlots');
  if (offer.k === 'omen') {
    run.omens.push(createOmen(run, offer.id));
    return;
  }
  run.trophies = [...trophiesOf(run).filter((id) => id !== offer.id), offer.id].slice(-TROPHY_SLOTS);
}
