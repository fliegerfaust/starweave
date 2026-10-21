import { FINAL_ANTE } from './content/balance';
import { BOSS_LIST } from './content/bosses';
import { skyDef } from './content/skies';
import { buildDeck } from './deck';
import { RuleError } from './errors';
import { createOmen } from './omen-instance';
import { createRng, pick, type RngState } from './rng';
import { allContent, type Unlocks } from './content/pools';
import { isLastNight, planChapter } from './route';
import { generateShop } from './shop';
import { COMBO_IDS, type ComboId, type RunState } from './types';

export const SAVE_VERSION = 4;

export interface NewRunOptions {
  seed: number;
  skyId?: string;
  daily?: boolean;
  dailyDate?: string;
  archive?: boolean;
  stake?: number;
  /** Первый забег новичка — щедрая первая ночь. */
  gentle?: boolean;
  /** Что игрок заработал в обучении и забирает в первый забег. */
  gift?: TutorialGift;
  /** Снимок открытий (TD.8); без него — весь контент (сим, бот, тесты). */
  unlocks?: Unlocks;
}

/**
 * Итог обучения, который переходит в первый забег, — только золото. Знамения игрок
 * зарабатывает в забеге сам (решение Дениса 15.10.2026): с «Звёздной пылью» с первого
 * хода 1-я глава проходилась почти без ходов.
 */
export interface TutorialGift {
  gold: number;
}

/** Больше этого из обучения не переносится — подарок, а не преимущество. */
export const GIFT_GOLD_CAP = 10;

export function rollBoss(rng: RngState, ante: number, previous: readonly string[]): string {
  const pool = BOSS_LIST.filter((b) => b.minAnte <= ante && !previous.slice(-3).includes(b.id));
  return pick(rng, pool.length ? pool : BOSS_LIST).id;
}

export function newRun({ seed, skyId = 'classic', daily = false, dailyDate, archive, stake = 0, gentle = false, gift, unlocks }: NewRunOptions): RunState {
  const sky = skyDef(skyId);
  const rng = createRng(seed);
  const { cards, nextId } = buildDeck(sky.deck, 1);
  const bosses: string[] = [];
  for (let ante = 1; ante <= FINAL_ANTE; ante++) bosses.push(rollBoss(rng, ante, bosses));
  sky.setupDeck?.(cards, rng);

  const run: RunState = {
    version: SAVE_VERSION,
    seed,
    rng,
    skyId,
    daily,
    ante: 1,
    chapter: planChapter({ ante: 1, bosses }),
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
    pending: [],
    unlocks: unlocks ? structuredClone(unlocks) : allContent(),
    stats: { linesIgnited: 0, bestPlacement: 0, bestCombo: 'scatter', crosses: 0, nightsWon: 0, goldEarned: 0 },
    endless: false,
    stake,
  };
  if (daily && dailyDate) run.dailyDate = dailyDate;
  if (daily && archive) run.archive = true;
  // Вызов дня у всех одинаковый — подыгрывать нельзя
  if (gentle && !daily) run.gentle = true;
  if (gift && !daily) {
    run.gold = Math.max(run.gold, Math.min(GIFT_GOLD_CAP, gift.gold));
  }
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
  // Купленный пакет не пропадает молча: сначала выбрать или пропустить
  if (run.pending.length) throw new RuleError('nothing');
  run.shop = null;
  if (!isLastNight(run)) {
    run.chapter.at += 1;
    run.phase = 'map';
    return;
  }
  run.ante += 1;
  if (run.ante > FINAL_ANTE && !run.endless) {
    run.phase = 'victory';
    return;
  }
  ensureBoss(run);
  run.chapter = planChapter(run);
  run.phase = 'map';
}

/** После победы — продолжить в бесконечном режиме. */
export function continueEndless(run: RunState): void {
  if (run.phase !== 'victory') throw new RuleError('notVictory');
  run.endless = true;
  ensureBoss(run);
  run.chapter = planChapter(run);
  run.phase = 'map';
}

function ensureBoss(run: RunState): void {
  while (run.bosses.length < run.ante) run.bosses.push(rollBoss(run.rng, run.bosses.length + 1, run.bosses));
}

export function isRunOver(run: RunState): boolean {
  return run.phase === 'gameOver';
}

/** Сколько ходов даёт второй шанс. */
export const REVIVE_MOVES = 3;

/** Можно ли продолжить проигранную ночь (кончились ходы, шанс не использован). */
export function canRevive(run: RunState): boolean {
  const night = run.night;
  return run.phase === 'gameOver' && !run.revived && !!night && night.movesLeft <= 0 && night.hand.length > 0 && !run.tutorial;
}

/** Второй шанс: ночь продолжается с несколькими ходами. */
export function reviveNight(run: RunState, moves = REVIVE_MOVES): void {
  if (!canRevive(run)) throw new RuleError('nothing');
  const night = run.night!;
  night.movesLeft += moves;
  night.result = 'playing';
  run.revived = true;
  run.phase = 'night';
}

export function canDoubleReward(run: RunState): boolean {
  return run.phase === 'reward' && !!run.reward && run.doubledAnte !== run.ante && !run.tutorial;
}

/** Удвоить награду ночи — раз за созвездие. */
export function doubleReward(run: RunState): void {
  if (!canDoubleReward(run)) throw new RuleError('nothing');
  const r = run.reward!;
  r.base *= 2;
  r.moves *= 2;
  r.burns *= 2;
  r.interest *= 2;
  r.total *= 2;
  run.doubledAnte = run.ante;
}
