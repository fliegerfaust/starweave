import { FINAL_ANTE } from './content/balance';
import { BOSS_LIST } from './content/bosses';
import { skyDef } from './content/skies';
import { buildDeck } from './deck';
import { RuleError } from './errors';
import { createOmen } from './omen-instance';
import { createRng, pick, type RngState } from './rng';
import { generateShop } from './shop';
import { COMBO_IDS, type ComboId, type RunState } from './types';

export const SAVE_VERSION = 1;

export interface NewRunOptions {
  seed: number;
  skyId?: string;
  daily?: boolean;
}

export function rollBoss(rng: RngState, ante: number, previous: readonly string[]): string {
  const pool = BOSS_LIST.filter((b) => b.minAnte <= ante && !previous.slice(-3).includes(b.id));
  return pick(rng, pool.length ? pool : BOSS_LIST).id;
}

export function newRun({ seed, skyId = 'classic', daily = false }: NewRunOptions): RunState {
  const sky = skyDef(skyId);
  const rng = createRng(seed);
  const { cards, nextId } = buildDeck(sky.deck, 1);
  const bosses: string[] = [];
  for (let ante = 1; ante <= FINAL_ANTE; ante++) bosses.push(rollBoss(rng, ante, bosses));

  const run: RunState = {
    version: SAVE_VERSION,
    seed,
    rng,
    skyId,
    daily,
    ante: 1,
    nightIndex: 0,
    phase: 'map',
    gold: sky.startGold,
    deck: cards,
    nextCardId: nextId,
    omens: [],
    nextOmenUid: 1,
    comboLevels: Object.fromEntries(COMBO_IDS.map((id) => [id, 1])) as Record<ComboId, number>,
    bosses,
    night: null,
    reward: null,
    shop: null,
    stats: { linesIgnited: 0, bestPlacement: 0, bestCombo: 'scatter', crosses: 0, nightsWon: 0, goldEarned: 0 },
    endless: false,
  };
  for (const id of sky.startOmens ?? []) run.omens.push(createOmen(run, id));
  return run;
}

/** Забрать награду ночи и войти в Обсерваторию. */
export function collectReward(run: RunState): void {
  if (run.phase !== 'reward' || !run.reward) throw new RuleError('noReward');
  run.gold += run.reward.total;
  run.stats.goldEarned += run.reward.total;
  run.reward = null;
  run.night = null;
  run.phase = 'shop';
  run.shop = generateShop(run);
}

/** Покинуть Обсерваторию: следующая ночь или победа. */
export function leaveShop(run: RunState): void {
  if (run.phase !== 'shop') throw new RuleError('notShop');
  run.shop = null;
  run.nightIndex += 1;
  if (run.nightIndex >= 3) {
    run.nightIndex = 0;
    run.ante += 1;
    if (run.ante > FINAL_ANTE && !run.endless) {
      run.phase = 'victory';
      return;
    }
    ensureBoss(run);
  }
  run.phase = 'map';
}

/** После победы — продолжить в бесконечном режиме. */
export function continueEndless(run: RunState): void {
  if (run.phase !== 'victory') throw new RuleError('notVictory');
  run.endless = true;
  ensureBoss(run);
  run.phase = 'map';
}

function ensureBoss(run: RunState): void {
  while (run.bosses.length < run.ante) run.bosses.push(rollBoss(run.rng, run.bosses.length + 1, run.bosses));
}

export function isRunOver(run: RunState): boolean {
  return run.phase === 'gameOver';
}
