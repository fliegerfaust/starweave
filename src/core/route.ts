import { BRIGHT_TARGET_SCALE, FINAL_ANTE, GENTLE_NIGHT } from './content/balance';
import { BOSS_LIST } from './content/bosses';
import { runNightReward, runNightTarget } from './content/stakes';
import { RuleError } from './errors';
import { offer } from './choices';
import { createRng, hashSeed, pick, shuffle, type RngState } from './rng';
import { rollComet, rollScope } from './wonders';
import { buildRules } from './rules';
import type { NightKind, Rules, RunState } from './types';

/**
 * Вид шага пути: обычная ночь, Яркая ночь (цель выше, Знамение 1 из 3), Затмение главы (RT.1),
 * Комета (обмен) и Телескоп (улучшение) — шаги без ночи (RT.4).
 */
export type RouteKind = 'night' | 'bright' | 'eclipse' | 'comet' | 'telescope';
export const ROUTE_KINDS: readonly RouteKind[] = ['night', 'bright', 'eclipse', 'comet', 'telescope'];

/** Шаг без ночи: Комета и Телескоп. */
export const isWonder = (route: RouteKind): route is 'comet' | 'telescope' => route === 'comet' || route === 'telescope';

/** Шаг пути в журнале главы (RT.3): что выбрано и где оно стояло в ряду шага — для созвездия пути. */
export interface JourneyStep {
  route: RouteKind;
  col: number;
  of: number;
}

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

/**
 * Второе Затмение главы (TR.3): из тех, что могут выпасть в этой главе, не Затмение главы и не
 * Затмения соседних глав (три прошлых, как у `rollBoss`, и следующее — его видно, заглянув вперёд).
 */
function rivalBoss(rng: RngState, run: PlanInput, bossId: string): string | null {
  const near = new Set([bossId, ...run.bosses.slice(Math.max(0, run.ante - 4), run.ante + 1)]);
  const pool = BOSS_LIST.filter((b) => b.minAnte <= run.ante && !near.has(b.id));
  return pool.length ? pick(rng, pool).id : null;
}

/** Ступень главы по номеру шага: первый — Сумерки, второй — Полночь, последний — Затмение. */
const STEP_KINDS: readonly NightKind[] = ['dusk', 'midnight', 'eclipse'];

/**
 * План главы `run.ante`. Развилки (ступень 2, `unlocks.routes`) — на каждом из двух первых
 * шагов Ночь и Яркая ночь в своём порядке, из каждой можно пойти в любую следующую. Со ступени 6
 * ещё Комета или Телескоп на шаге и два Затмения на последнем. Порядок —
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
  // Ступень 6: на каждом шаге ещё Комета или Телескоп — шаг без ночи
  const wonders = run.unlocks?.wonders ? shuffle(rng, ['comet', 'telescope'] as RouteKind[]) : [];
  for (const step of [1, 2]) {
    const kinds = shuffle(rng, ['night', 'bright', ...wonders.slice(step - 1, step)] as RouteKind[]);
    for (const route of kinds) nodes.push({ kind: STEP_KINDS[step - 1]!, bossId: null, route, step, next: [] });
  }
  // Ступень 6: в конце главы два Затмения на выбор (TR.3), порядок корон — от сида
  const rival = run.unlocks?.wonders && bossId ? rivalBoss(rng, run, bossId) : null;
  const crowns = rival ? shuffle(rng, [bossId, rival]) : [bossId];
  for (const id of crowns) nodes.push({ kind: 'eclipse', bossId: id, route: 'eclipse', step: 3, next: [] });
  // Из каждого узла — в любой узел следующего шага; из шага без ночи — только в ночь:
  // до Затмения в любом пути хотя бы одна ночь
  nodes.forEach((n) => (n.next = nodes.flatMap((m, j) => (m.step === n.step + 1 && !(isWonder(n.route) && isWonder(m.route)) ? [j] : []))));
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

/**
 * Войти в шаг без ночи (команда `visit`): Комета или Телескоп кладут свой выбор в очередь;
 * когда его возьмут или пропустят, шаг пройден (`choices.ts`).
 */
export function visitWonder(run: RunState): void {
  const node = run.phase === 'map' && run.chapter.at >= 0 ? run.chapter.nodes[run.chapter.at]! : null;
  if (!node || !isWonder(node.route) || run.pending.length) throw new RuleError('nothing');
  if (node.route === 'comet') offer(run, { kind: 'comet', options: rollComet(run) });
  else offer(run, { kind: 'telescope', options: rollScope(run) });
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

/** Узел пройден в забеге: шаг — в журнал пути главы (RT.3), глава — дальше. */
export function walk(run: RunState): void {
  const node = run.chapter.nodes[run.chapter.at]!;
  const row = run.chapter.nodes.flatMap((m, j) => (m.step === node.step ? [j] : []));
  const journey = (run.journey ??= []);
  (journey[run.ante - 1] ??= []).push({ route: node.route, col: row.indexOf(run.chapter.at), of: row.length });
  // Выбранное Затмение — Затмение главы: от него считаются повторы в главах дальше
  if (node.bossId) run.bosses[run.ante - 1] = node.bossId;
  passNode(run.chapter);
}

/**
 * Ночь, которую игрок сыграет следующей. Пока путь не выбран — первый из вариантов шага:
 * ступень (Сумерки, Полночь, Затмение) у всех вариантов одна, а Затмение со ступени 6 выбирают.
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
