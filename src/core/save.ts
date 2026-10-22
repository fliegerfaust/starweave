import { BOSSES } from './content/bosses';
import { OMENS } from './content/omens';
import { RITUALS } from './content/rituals';
import { SKIES } from './content/skies';
import { allContent } from './content/pools';
import { planChapter, ROUTE_KINDS } from './route';
import { SAVE_VERSION } from './run';
import { BODY_IDS, COMBO_IDS, GLYPHS, MAX_RANK, MIN_RANK, NIGHT_KINDS, SUITS, type PackKind, type RunPhase, type RunState } from './types';

const comboRegistry = Object.fromEntries(COMBO_IDS.map((id) => [id, true]));

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
    // Тогда глава была цепочкой: узлы без пути и шагов — их допишет шаг 5
    run.chapter = { nodes: planChapter({ ante: run.ante, bosses: run.bosses as string[] }).nodes.map(({ kind, bossId }) => ({ kind, bossId })), at: run.nightIndex };
    delete run.nightIndex;
  },
  // 3 (TD.7): открытый пакет Обсерватории — выбор в очереди `pending`; команды пакета в журнале — общие
  2(run) {
    const open = isObj(run.shop) ? run.shop.openPack : null;
    run.pending = isObj(open) ? [{ kind: 'pack', pack: open.pack, options: open.options }] : [];
    if (isObj(run.shop)) delete run.shop.openPack;
    if (isObj(run.log) && Array.isArray(run.log.cmds)) {
      for (const cmd of run.log.cmds as Raw[]) {
        if (cmd.c === 'choosePack') cmd.c = 'choose';
        else if (cmd.c === 'skipPack') cmd.c = 'skip';
      }
    }
  },
  // 4 (TD.8): снимок открытий — старые забеги играли со всем контентом
  3(run) {
    run.unlocks = allContent();
  },
  // 5 (GF.1): дар ночи и небесные тела — начатый до 0.7 забег доигрывается без них
  4(run) {
    if (isObj(run.unlocks)) {
      run.unlocks.gift = false;
      run.unlocks.bodies = [];
    }
  },
  // 6 (RT.1): глава — граф с путём; старая цепочка из трёх ночей — тот же граф, без развилок
  5(run) {
    if (isObj(run.unlocks)) run.unlocks.routes = false;
    const c = run.chapter;
    if (!isObj(c) || !Array.isArray(c.nodes) || !isInt(c.at)) return;
    c.nodes = (c.nodes as Raw[]).map((n, i, all) => ({ ...n, route: n.kind === 'eclipse' ? 'eclipse' : 'night', step: i + 1, next: i < all.length - 1 ? [i + 1] : [] }));
    c.path = Array.from({ length: c.at }, (_, i) => i);
  },
};

/** Запись по ключам союза: новая фаза без строки здесь — ошибка типов, а не потерянное сохранение. */
const PHASE_SET: Record<RunPhase, true> = { map: true, night: true, reward: true, shop: true, gameOver: true, victory: true };
const PHASES = Object.keys(PHASE_SET) as RunPhase[];

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const has = (reg: object, id: unknown) => typeof id === 'string' && Object.hasOwn(reg, id);

const isBody = (b: unknown) => (BODY_IDS as readonly unknown[]).includes(b);
const isGlyph = (g: unknown) => (GLYPHS as readonly unknown[]).includes(g);

/** Карта без id: масть, ранг, глиф или тело этой сборки (тело от новой сборки уронило бы арт). */
function isFace(c: unknown): c is Raw {
  if (!isObj(c) || !(SUITS as readonly unknown[]).includes(c.suit) || !isInt(c.rank) || c.rank < MIN_RANK || c.rank > MAX_RANK) return false;
  return (c.glyph === undefined || isGlyph(c.glyph)) && (c.body === undefined || isBody(c.body));
}

function isCard(c: unknown): boolean {
  return isFace(c) && isInt(c.id);
}
const isCards = (v: unknown) => Array.isArray(v) && v.every(isCard);

/** Журнал команд (TD.9): версия, условия старта и список команд. */
function isLog(log: unknown): boolean {
  return isObj(log) && isInt(log.version) && isObj(log.start) && isInt(log.start.seed)
    && Array.isArray(log.cmds) && log.cmds.every((c) => isObj(c) && typeof c.c === 'string');
}

/** Снимок открытий: известные этой сборке Знамения, ритуалы и тела. */
function isUnlocks(u: unknown): boolean {
  return isObj(u) && Array.isArray(u.omens) && u.omens.every((id) => has(OMENS, id))
    && Array.isArray(u.rituals) && u.rituals.every((id) => has(RITUALS, id))
    && typeof u.gift === 'boolean' && Array.isArray(u.bodies) && u.bodies.every(isBody) && typeof u.routes === 'boolean';
}

const PACK_SET: Record<PackKind, true> = { omen: true, ritual: true, chart: true };

/** Вариант дара: новая карта или Возвышение карты колоды. */
function isGiftOffer(o: unknown): boolean {
  return isObj(o) && ((o.k === 'card' && isFace(o.card)) || (o.k === 'ascend' && isInt(o.cardId)));
}

/** Выбор в очереди: варианты существуют в этой сборке (иначе `omenDef` уронит экран). */
function isChoice(c: unknown): boolean {
  if (isObj(c) && c.kind === 'gift') return Array.isArray(c.options) && c.options.length > 0 && c.options.every(isGiftOffer);
  if (!isObj(c) || c.kind !== 'pack' || !has(PACK_SET, c.pack) || !Array.isArray(c.options) || c.options.length === 0) return false;
  const reg = c.pack === 'omen' ? OMENS : c.pack === 'ritual' ? RITUALS : comboRegistry;
  return c.options.every((id) => has(reg, id));
}

/** План главы: узлы с видами этой сборки, рёбра и путь — по индексам узлов. */
function isChapter(c: unknown): boolean {
  if (!isObj(c) || !Array.isArray(c.nodes) || c.nodes.length === 0 || !isInt(c.at) || c.at < -1 || c.at >= c.nodes.length) return false;
  const n = c.nodes.length;
  const index = (i: unknown) => isInt(i) && i >= 0 && i < n;
  if (!Array.isArray(c.path) || !c.path.every(index)) return false;
  return c.nodes.every((node) => isObj(node) && (NIGHT_KINDS as readonly unknown[]).includes(node.kind) && (node.bossId === null || has(BOSSES, node.bossId))
    && (ROUTE_KINDS as readonly unknown[]).includes(node.route) && isInt(node.step) && Array.isArray(node.next) && node.next.every(index));
}

/**
 * Забег, который можно открыть: известная фаза, карты, Знамения, Затмения и небо есть в
 * игре. Иначе — null: сохранение от более новой сборки или битое не должно ронять запуск
 * (`omenDef` бросает на незнакомом id — игра не открылась бы вовсе).
 */
function isPlayable(run: Raw): boolean {
  if (!PHASES.includes(run.phase as RunPhase) || !has(SKIES, run.skyId)) return false;
  if (!isInt(run.ante) || run.ante < 1 || !isChapter(run.chapter)) return false;
  if (!Array.isArray(run.pending) || !run.pending.every(isChoice)) return false;
  if (!isUnlocks(run.unlocks)) return false;
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
    }
    // Битый журнал не должен стоить игроку забега: забег открываем без журнала
    if (run.log !== undefined && !isLog(run.log)) delete run.log;
    return isPlayable(run) ? (run as unknown as RunState) : null;
  } catch {
    return null;
  }
}
