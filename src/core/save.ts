import { BOSSES } from './content/bosses';
import { OMENS } from './content/omens';
import { RITUALS } from './content/rituals';
import { SKIES } from './content/skies';
import { planChapter } from './route';
import { SAVE_VERSION } from './run';
import { COMBO_IDS, MAX_RANK, MIN_RANK, NIGHT_KINDS, SUITS, type RunPhase, type RunState } from './types';

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

/**
 * Шаги миграции сохранения (TD.1): `n` переводит забег версии `n` в `n + 1`. Новая версия
 * формата — новый шаг здесь, `SAVE_VERSION + 1` в `run.ts` и тест на сохранение прошлой версии.
 */
const RUN_MIGRATIONS: Record<number, (run: Record<string, unknown>) => void> = {
  // 2 (TD.6): место в главе — план главы `chapter` вместо номера ночи 0..2
  1(run) {
    if (!isInt(run.ante) || !Array.isArray(run.bosses) || !isInt(run.nightIndex)) return;
    run.chapter = { ...planChapter({ ante: run.ante, bosses: run.bosses as string[] }), at: run.nightIndex };
    delete run.nightIndex;
  },
};

/** Запись по ключам союза: новая фаза без строки здесь — ошибка типов, а не потерянное сохранение. */
const PHASE_SET: Record<RunPhase, true> = { map: true, night: true, reward: true, shop: true, gameOver: true, victory: true };
const PHASES = Object.keys(PHASE_SET) as RunPhase[];

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const has = (reg: object, id: unknown) => typeof id === 'string' && Object.hasOwn(reg, id);

function isCard(c: unknown): boolean {
  return isObj(c) && isInt(c.id) && (SUITS as readonly unknown[]).includes(c.suit) && isInt(c.rank) && c.rank >= MIN_RANK && c.rank <= MAX_RANK;
}
const isCards = (v: unknown) => Array.isArray(v) && v.every(isCard);

/** Журнал команд (TD.9): версия, условия старта и список команд. */
function isLog(log: unknown): boolean {
  return isObj(log) && isInt(log.version) && isObj(log.start) && isInt(log.start.seed)
    && Array.isArray(log.cmds) && log.cmds.every((c) => isObj(c) && typeof c.c === 'string');
}

function isChapter(c: unknown): boolean {
  if (!isObj(c) || !Array.isArray(c.nodes) || c.nodes.length === 0 || !isInt(c.at) || c.at < 0 || c.at >= c.nodes.length) return false;
  return c.nodes.every((n) => isObj(n) && (NIGHT_KINDS as readonly unknown[]).includes(n.kind) && (n.bossId === null || has(BOSSES, n.bossId)));
}

/**
 * Забег, который можно открыть: известная фаза, карты, Знамения, Затмения и небо есть в
 * игре. Иначе — null: сохранение от более новой сборки или битое не должно ронять запуск
 * (`omenDef` бросает на незнакомом id — игра не открылась бы вовсе).
 */
function isPlayable(run: Raw): boolean {
  if (!PHASES.includes(run.phase as RunPhase) || !has(SKIES, run.skyId)) return false;
  if (!isInt(run.ante) || run.ante < 1 || !isChapter(run.chapter)) return false;
  if (!isCards(run.deck) || !isObj(run.rng) || typeof run.gold !== 'number') return false;
  if (!Array.isArray(run.omens) || !run.omens.every((o) => isObj(o) && isInt(o.uid) && has(OMENS, o.id) && isObj(o.data))) return false;
  if (!Array.isArray(run.bosses) || !run.bosses.every((b) => has(BOSSES, b))) return false;
  if (!isObj(run.comboLevels) || !COMBO_IDS.every((id) => isInt((run.comboLevels as Raw)[id]))) return false;
  if (!isObj(run.stats)) return false;
  const night = run.night;
  if (night !== null && night !== undefined) {
    if (!isObj(night) || !isCards(night.hand) || !isCards(night.drawPile) || !isCards(night.discard)) return false;
    if (!Array.isArray(night.grid) || !night.grid.every((c) => c === null || isCard(c)) || !Array.isArray(night.sealed)) return false;
    if (night.bossId !== null && !has(BOSSES, night.bossId)) return false;
    if (!isObj(night.rules)) return false;
  } else if (run.phase === 'night') return false;
  const shop = run.shop;
  if (shop !== null && shop !== undefined) {
    if (!isObj(shop) || !Array.isArray(shop.omens) || !Array.isArray(shop.items)) return false;
    for (const item of [...shop.omens, ...shop.items, ...(Array.isArray(shop.packs) ? shop.packs : [])]) {
      if (!isObj(item)) return false;
      if (item.kind === 'omen' && !has(OMENS, item.omenId)) return false;
      if (item.kind === 'ritual' && !has(RITUALS, item.ritualId)) return false;
    }
  } else if (run.phase === 'shop') return false;
  return true;
}

/** Возвращает null, если сохранение битое, от более новой сборки или ссылается на неизвестное. */
export function deserializeRun(text: string | null): RunState | null {
  if (!text) return null;
  try {
    const run = JSON.parse(text) as unknown;
    if (!isObj(run) || !isInt(run.version) || run.version < 1 || run.version > SAVE_VERSION) return null;
    for (let v = run.version; v < SAVE_VERSION; v++) RUN_MIGRATIONS[v]?.(run);
    run.version = SAVE_VERSION;
    // Мягкая миграция: поля, добавленные после первой версии сохранений
    if (isObj(run.shop)) {
      run.shop.packs ??= [];
      run.shop.openPack ??= null;
    }
    // Битый журнал не должен стоить игроку забега: забег открываем без журнала
    if (run.log !== undefined && !isLog(run.log)) delete run.log;
    return isPlayable(run) ? (run as unknown as RunState) : null;
  } catch {
    return null;
  }
}
