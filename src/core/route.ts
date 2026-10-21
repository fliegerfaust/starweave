import { FINAL_ANTE, GENTLE_NIGHT } from './content/balance';
import { runNightReward, runNightTarget } from './content/stakes';
import { buildRules } from './rules';
import { NIGHT_KINDS, type NightKind, type Rules, type RunState } from './types';

/** Узел главы: какая ночь и чьё Затмение. Развилки 0.7 добавят узлам выбор пути. */
export interface ChapterNode {
  kind: NightKind;
  bossId: string | null;
}

/** План главы: ночи по порядку и где игрок сейчас. Его рисует карта, по нему идёт ядро. */
export interface Chapter {
  nodes: ChapterNode[];
  /** Индекс текущей (ещё не пройденной) ночи в `nodes`. */
  at: number;
}

/** Ночь, как её увидит игрок: правила, цель и награда с поправками щедрой ночи. */
export interface NightPlan extends ChapterNode {
  rules: Rules;
  target: number;
  reward: number;
  gentle: boolean;
}

/**
 * План главы `run.ante`: Сумерки, Полночь, Затмение. Без случайности — Затмения
 * разыграны заранее в `run.bosses`, — поэтому план можно построить и для главы впереди.
 */
export function planChapter(run: Pick<RunState, 'ante' | 'bosses'>): Chapter {
  return {
    nodes: NIGHT_KINDS.map((kind) => ({ kind, bossId: kind === 'eclipse' ? (run.bosses[run.ante - 1] ?? null) : null })),
    at: 0,
  };
}

/** Ночь, которую игрок сыграет следующей. */
export function currentNode(run: RunState): ChapterNode {
  return run.chapter.nodes[run.chapter.at]!;
}

/** Последняя ли это ночь главы. */
export function isLastNight(run: RunState): boolean {
  return run.chapter.at >= run.chapter.nodes.length - 1;
}

/**
 * Правила, цель и награда ночи `index` главы. `run.ante` — глава этой ночи: для взгляда
 * вперёд передают забег с главой впереди. Щедрая ночь новичка — первая ночь первой главы.
 */
export function planNight(run: RunState, node: ChapterNode, index: number): NightPlan {
  const rules = buildRules(run, node.bossId);
  let target = runNightTarget(run, node.kind, node.bossId);
  const gentle = !!run.gentle && run.ante === 1 && index === 0 && !node.bossId;
  if (gentle) {
    rules.moves = Math.min(rules.moves, GENTLE_NIGHT.moves);
    target = Math.min(target, GENTLE_NIGHT.target);
  }
  return { ...node, rules, target, reward: runNightReward(run, node.kind), gentle };
}

/** Где окажется игрок после этой ночи: следующая ночь главы или первая ночь следующей. */
export function nextStop(run: RunState): { ante: number; chapter: Chapter } {
  if (!isLastNight(run)) return { ante: run.ante, chapter: { ...run.chapter, at: run.chapter.at + 1 } };
  const ante = run.ante + 1;
  return { ante, chapter: planChapter({ ante, bosses: run.bosses }) };
}

/** Есть ли куда идти после этой ночи (иначе впереди победа). */
export function hasNextNight(run: RunState): boolean {
  return run.endless || run.ante < FINAL_ANTE || !isLastNight(run);
}
