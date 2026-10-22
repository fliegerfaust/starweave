import { BRIGHT_TARGET_SCALE, FINAL_ANTE, GENTLE_NIGHT } from './content/balance';
import { runNightReward, runNightTarget } from './content/stakes';
import { RuleError } from './errors';
import { createRng, hashSeed, shuffle } from './rng';
import { buildRules } from './rules';
import type { NightKind, Rules, RunState } from './types';

/**
 * Вид шага пути (RT.1): обычная ночь, Яркая ночь (цель выше, Знамение 1 из 3), Затмение
 * главы. Комета и Телескоп (RT.4) встанут сюда же — шаги без ночи.
 */
export type RouteKind = 'night' | 'bright' | 'eclipse';
export const ROUTE_KINDS: readonly RouteKind[] = ['night', 'bright', 'eclipse'];

/**
 * Узел главы: какая ночь, чьё Затмение и куда из него можно пойти. `kind` — ступень главы
 * для цели и награды (Сумерки, Полночь, Затмение), `route` — что выбрал игрок.
 */
export interface ChapterNode {
  kind: NightKind;
  bossId: string | null;
  route: RouteKind;
  /** Шаг главы: 1, 2, … — последний шаг — Затмение. */
  step: number;
  /** Индексы узлов следующего шага, куда можно пойти отсюда. */
  next: number[];
}

/**
 * План главы — граф (RT.1): шаги по 1–2 узла и Затмение. Без развилок это та же цепочка
 * Сумерки → Полночь → Затмение, у каждого шага один узел. `at` — узел, который игрок сыграет
 * следующим (`-1` — путь ещё не выбран), `path` — пройденные узлы по порядку.
 */
export interface Chapter {
  nodes: ChapterNode[];
  at: number;
  path: number[];
}

/** Ночь, как её увидит игрок: правила, цель и награда с поправками щедрой ночи. */
export interface NightPlan extends ChapterNode {
  rules: Rules;
  target: number;
  reward: number;
  gentle: boolean;
}

type PlanInput = Pick<RunState, 'ante' | 'bosses'> & Partial<Pick<RunState, 'seed' | 'unlocks' | 'tutorial'>>;

/** Ступень главы по номеру шага: первый — Сумерки, второй — Полночь, последний — Затмение. */
const STEP_KINDS: readonly NightKind[] = ['dusk', 'midnight', 'eclipse'];

/**
 * План главы `run.ante`. Развилки (ступень 2, `unlocks.routes`) — на каждом из двух первых
 * шагов Ночь и Яркая ночь в своём порядке, из каждой можно пойти в любую следующую. Порядок —
 * от сида и номера главы, а не от ГПСЧ забега: план главы впереди строится заранее и не
 * сдвигает броски. Без развилок — цепочка из трёх ночей.
 */
export function planChapter(run: PlanInput): Chapter {
  const bossId = run.bosses[run.ante - 1] ?? null;
  const forks = !!run.unlocks?.routes && !run.tutorial;
  if (!forks) {
    return {
      nodes: STEP_KINDS.map((kind, i) => ({ kind, bossId: kind === 'eclipse' ? bossId : null, route: kind === 'eclipse' ? 'eclipse' : 'night', step: i + 1, next: i < 2 ? [i + 1] : [] })),
      at: 0,
      path: [],
    };
  }
  const rng = createRng(hashSeed(`route:${run.seed ?? 0}:${run.ante}`));
  const nodes: ChapterNode[] = [];
  for (const step of [1, 2]) {
    const kinds = shuffle(rng, ['night', 'bright'] as RouteKind[]);
    for (const route of kinds) nodes.push({ kind: STEP_KINDS[step - 1]!, bossId: null, route, step, next: [] });
  }
  nodes.push({ kind: 'eclipse', bossId, route: 'eclipse', step: 3, next: [] });
  // Из каждого узла — в любой узел следующего шага
  nodes.forEach((n) => (n.next = nodes.flatMap((m, j) => (m.step === n.step + 1 ? [j] : []))));
  return { nodes, at: -1, path: [] };
}

/** Узлы, из которых игрок выбирает следующий шаг. */
export function routeOptions(chapter: Chapter): number[] {
  const last = chapter.path.at(-1);
  if (last === undefined) return chapter.nodes.flatMap((n, i) => (n.step === 1 ? [i] : []));
  return chapter.nodes[last]!.next;
}

/** Есть ли сейчас выбор пути (больше одного варианта). */
export function hasFork(chapter: Chapter): boolean {
  return routeOptions(chapter).length > 1;
}

/** Есть ли в главе развилки вообще — тогда карта рисует граф, а не цепочку. */
export function isForked(chapter: Chapter): boolean {
  return chapter.nodes.length > STEP_KINDS.length;
}

/** Встать на следующий шаг: единственный вариант выбирается сам, развилка ждёт игрока. */
function arrive(chapter: Chapter): void {
  const options = routeOptions(chapter);
  chapter.at = options.length === 1 ? options[0]! : -1;
}

/** Выбрать узел пути на развилке (команда `route`). */
export function chooseRoute(run: RunState, node: number): void {
  if (run.phase !== 'map') throw new RuleError('notMap');
  if (!routeOptions(run.chapter).includes(node)) throw new RuleError('nothing');
  run.chapter.at = node;
}

/** Узел пройден: в путь, и на следующий шаг. */
export function passNode(chapter: Chapter): void {
  chapter.path.push(chapter.at);
  arrive(chapter);
}

/**
 * Ночь, которую игрок сыграет следующей. Пока путь не выбран — первый из вариантов шага:
 * его ступень (Сумерки, Полночь) и Затмение главы у всех вариантов одни и те же.
 */
export function currentNode(run: Pick<RunState, 'chapter'>): ChapterNode {
  const { chapter } = run;
  return chapter.nodes[chapter.at >= 0 ? chapter.at : routeOptions(chapter)[0]!]!;
}

/** Последняя ли это ночь главы (Затмение). */
export function isLastNight(run: Pick<RunState, 'chapter'>): boolean {
  return currentNode(run).next.length === 0;
}

/**
 * Правила, цель и награда ночи узла. `run.ante` — глава этой ночи: для взгляда вперёд передают
 * забег с главой впереди. Щедрая ночь новичка — первый шаг первой главы. Яркая ночь — цель ×1.35.
 */
export function planNight(run: RunState, node: ChapterNode): NightPlan {
  const rules = buildRules(run, node.bossId);
  let target = runNightTarget(run, node.kind, node.bossId);
  if (node.route === 'bright') target = Math.round(target * BRIGHT_TARGET_SCALE);
  const gentle = !!run.gentle && run.ante === 1 && node.step === 1 && !node.bossId && node.route === 'night';
  if (gentle) {
    rules.moves = Math.min(rules.moves, GENTLE_NIGHT.moves);
    target = Math.min(target, GENTLE_NIGHT.target);
  }
  return { ...node, rules, target, reward: runNightReward(run, node.kind), gentle };
}

/** Где окажется игрок после этой ночи: следующий шаг главы или начало следующей. */
export function nextStop(run: RunState): { ante: number; chapter: Chapter } {
  if (!isLastNight(run)) {
    const chapter = structuredClone(run.chapter);
    passNode(chapter);
    return { ante: run.ante, chapter };
  }
  const ante = run.ante + 1;
  return { ante, chapter: planChapter({ ...run, ante }) };
}

/** Есть ли куда идти после этой ночи (иначе впереди победа). */
export function hasNextNight(run: RunState): boolean {
  return run.endless || run.ante < FINAL_ANTE || !isLastNight(run);
}
