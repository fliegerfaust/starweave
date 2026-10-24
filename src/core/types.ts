import type { Unlocks } from './content/pools';
import type { Choice } from './choices';
import type { RunLog } from './commands';
import type { Chapter, JourneyStep } from './route';
import type { RngState } from './rng';

// ─── Карты ─────────────────────────────────────────────────────────────────

export const SUITS = ['sun', 'moon', 'star', 'comet'] as const;
export type Suit = (typeof SUITS)[number];

export const MIN_RANK = 1;
export const MAX_RANK = 9;

export const GLYPHS = ['gilded', 'blazing', 'radiant', 'echo', 'glass', 'prism'] as const;
export type Glyph = (typeof GLYPHS)[number];

/** Небесные тела (GF.3): карты с правилом места. У карты либо глиф, либо тело. */
export const BODY_IDS = ['polaris', 'meteor', 'pulsar', 'twin', 'nebula', 'blackhole'] as const;
export type BodyId = (typeof BODY_IDS)[number];

export interface Card {
  /** Уникален в пределах забега; по нему карта находится в колоде после копирования в ночь. */
  id: number;
  suit: Suit;
  rank: number;
  glyph?: Glyph;
  body?: BodyId;
}

// ─── Созвездия ─────────────────────────────────────────────────────────────

export const COMBO_IDS = [
  'scatter',
  'pair',
  'twoPair',
  'mirror',
  'triple',
  'straight',
  'flush',
  'cascade',
  'quartet',
  'starFlush',
  'supernova',
] as const;
export type ComboId = (typeof COMBO_IDS)[number];

// ─── Небо ──────────────────────────────────────────────────────────────────

export type LineKind = 'row' | 'col' | 'diag';

export interface Line {
  /** Например `row-0`, `col-3`, `diag-main`. */
  id: string;
  kind: LineKind;
  /** Индексы клеток по порядку чтения линии (слева направо / сверху вниз). */
  cells: number[];
}

// ─── Правила ночи ──────────────────────────────────────────────────────────

/**
 * Правила собираются заново перед каждой ночью: база → колода неба → Затмение → Знамения.
 * Всё, что может поменять контент, должно жить здесь, а не в константах.
 */
export interface Rules {
  gridSize: number;
  handSize: number;
  moves: number;
  burns: number;
  rowsIgnite: boolean;
  colsIgnite: boolean;
  diagonals: boolean;
  /** На сколько карт меньше длины линии достаточно для флеша. */
  flushSlack: number;
  /** Сколько пропусков допускает стрит. */
  straightGaps: number;
  /** Добавка к множителю цепи, когда вспыхнуло ≥ 2 линий. */
  chainBonus: number;
  omenSlots: number;
  sealedCells: number;
  debuffSuit: Suit | null;
  hideRanks: boolean;
  /** Сколько верхних карт колоды видно (трофей «Ясное небо»); нет — ни одной. */
  peek?: number;
  /** Россыпь засчитывается Парой (трофей «Помилование»). */
  scatterAsPair?: boolean;
  interestStep: number;
  interestCap: number;
}

// ─── Знамения ──────────────────────────────────────────────────────────────

export interface OmenInstance {
  uid: number;
  id: string;
  /** Состояние накопительных Знамений (счётчики, растущие множители). */
  data: Record<string, number>;
}

// ─── Подсчёт ───────────────────────────────────────────────────────────────

/**
 * Чей эффект записал шаг подсчёта (TD.5). Новый источник — трофей, покровитель,
 * пророчество — новый вариант здесь и строка в `EFFECT_SOURCES`; подписи шагов в UI
 * перечисляют варианты полностью, так что забытая подпись — ошибка типов.
 */
export type EffectSource =
  | { kind: 'omen'; uid: number; omenId: string; cell?: number }
  | { kind: 'boss'; bossId: string }
  /** Трофей Затмения (TR.1): `trophyId` — id Затмения, которое приручили. */
  | { kind: 'trophy'; trophyId: string };

export type StepSource =
  | { kind: 'combo'; combo: ComboId }
  | { kind: 'card'; cell: number; cardId: number }
  | { kind: 'glyph'; cell: number; cardId: number; glyph: Glyph }
  /** Небесное тело: Чёрная дыра на своей клетке, Пульсар — без клетки (копит на всю ночь). */
  | { kind: 'body'; body: BodyId; cell?: number; cardId?: number }
  | { kind: 'chain'; lines: number }
  | EffectSource;

/** Один вклад в подсчёт. Презентер проигрывает шаги по порядку как всплывающие числа. */
export interface ScoreStep {
  source: StepSource;
  light?: number;
  mult?: number;
  xMult?: number;
  gold?: number;
  /** Текущие значения после шага — чтобы анимации не пересчитывали. */
  lightAfter: number;
  multAfter: number;
}

export interface LineScore {
  line: Line;
  combo: ComboId;
  cells: number[];
  steps: ScoreStep[];
  light: number;
  mult: number;
  total: number;
}

export interface PlacementScore {
  lines: LineScore[];
  /** Шаги уровня хода: цепь, «последний ход» и т.п. */
  steps: ScoreStep[];
  chainMult: number;
  xMult: number;
  total: number;
  gold: number;
  /** Карты-стекло, разбившиеся в этом ходу. */
  shattered: number[];
}

// ─── Ночь ──────────────────────────────────────────────────────────────────

export type NightKind = 'dusk' | 'midnight' | 'eclipse';
export const NIGHT_KINDS: readonly NightKind[] = ['dusk', 'midnight', 'eclipse'];

export interface NightState {
  kind: NightKind;
  bossId: string | null;
  target: number;
  score: number;
  rules: Rules;
  movesLeft: number;
  burnsLeft: number;
  hand: Card[];
  drawPile: Card[];
  discard: Card[];
  grid: (Card | null)[];
  sealed: boolean[];
  placements: number;
  ignitions: number;
  linesIgnited: number;
  bestPlacement: number;
  result: 'playing' | 'won' | 'lost';
  /** Щедрая ночь новичка: добор подыгрывает, ходов и цели меньше. */
  gentle?: boolean;
  /** Сколько множителя накопили Пульсары за ночь: прибавляется к каждой линии. */
  pulse?: number;
  /** Счётчики трофеев на ночь (TR.1), по id трофея. */
  trophyData?: Record<string, Record<string, number>>;
}

// ─── Забег ─────────────────────────────────────────────────────────────────

export type RunPhase = 'map' | 'night' | 'reward' | 'shop' | 'gameOver' | 'victory';

export interface RewardSummary {
  base: number;
  moves: number;
  burns: number;
  interest: number;
  total: number;
}

export type PackKind = 'omen' | 'ritual' | 'chart';

export type ShopItem =
  | { kind: 'omen'; omenId: string; price: number; sold: boolean }
  | { kind: 'chart'; combo: ComboId; price: number; sold: boolean }
  | { kind: 'ritual'; ritualId: string; price: number; sold: boolean }
  | { kind: 'pack'; pack: PackKind; price: number; sold: boolean };

export interface ShopState {
  omens: ShopItem[];
  items: ShopItem[];
  packs: ShopItem[];
  rerollCost: number;
  /** Услуга «Убрать карту» уже использована в этот визит (нет в старых сохранениях). */
  banishUsed?: boolean;
}

export interface RunStats {
  linesIgnited: number;
  bestPlacement: number;
  bestCombo: ComboId;
  crosses: number;
  nightsWon: number;
  goldEarned: number;
}

export interface RunState {
  version: number;
  seed: number;
  rng: RngState;
  skyId: string;
  daily: boolean;
  /** Дата вызова дня (YYYY-MM-DD): по ней сид и запись результата, даже если доиграли после полуночи. */
  dailyDate?: string;
  /** Вызов из архива атласа: прошедший день, попыток сколько угодно, лучший итог в профиль. */
  archive?: boolean;
  ante: number;
  /** План текущей главы и место в нём (`core/route.ts`). */
  chapter: Chapter;
  phase: RunPhase;
  gold: number;
  deck: Card[];
  nextCardId: number;
  omens: OmenInstance[];
  nextOmenUid: number;
  /** Приручённые Затмения (TR.1): id Затмений, не больше `TROPHY_SLOTS`. Нет в старых сохранениях. */
  trophies?: string[];
  comboLevels: Record<ComboId, number>;
  /** Затмение каждого созвездия, разыграно заранее (видно на карте). */
  bosses: string[];
  night: NightState | null;
  reward: RewardSummary | null;
  shop: ShopState | null;
  /** Очередь выборов «возьми одно» (`core/choices.ts`): первый — на экране. */
  pending: Choice[];
  /** Снимок открытий на старте (`content/pools.ts`): из чего выпадают лавка и пакеты. */
  unlocks: Unlocks;
  stats: RunStats;
  endless: boolean;
  /** Звёздность (0 — обычная сложность). */
  stake?: number;
  /** Учебный забег: сценарная колода, без Затмений, две ночи. */
  tutorial?: boolean;
  /** Первый забег новичка: первая ночь щедрая (см. `GENTLE_NIGHT`). */
  gentle?: boolean;
  /** Забег по вызову друга: его итог, с которым сравниваем свой (см. `game/challenge.ts`). */
  challenge?: { ante: number; best: number };
  /** Второй шанс уже использован в этом забеге. */
  revived?: boolean;
  /** Журнал команд (TD.9): с чего начали и что делал игрок. Нет у обучения и старых сохранений. */
  log?: RunLog;
  /** В каком созвездии награду уже удваивали. */
  doubledAnte?: number;
  /** Сколько линий уже записано в профиль (забег после победы продолжается). */
  recordedLines?: number;
  /** Путь каждой главы (RT.3): индекс — глава − 1; рисуется созвездием в итогах забега. */
  journey?: JourneyStep[][];
}

// ─── События для презентера ───────────────────────────────────────────────

export type GameEvent =
  | { t: 'nightStart'; kind: NightKind; bossId: string | null; target: number; sealed: number[] }
  | { t: 'draw'; cards: Card[] }
  | { t: 'reshuffle'; count: number }
  | { t: 'place'; card: Card; handIndex: number; cell: number }
  | { t: 'burn'; card: Card; handIndex: number }
  | { t: 'ignite'; score: PlacementScore; scoreAfter: number }
  | { t: 'clear'; cells: number[] }
  /** Карта вспыхнувшей линии осталась на небе (политика клеток, этап хода). */
  | { t: 'cardStays'; cardId: number; cell: number }
  /** Карта ушла из колоды насовсем: Стекло разбилось, Чёрная дыра схлопнулась. */
  | { t: 'cardDestroyed'; cardId: number; cell: number; reason: 'shattered' | 'consumed' }
  /** Метеор выбил соседа с неба в сброс — до поиска линий. */
  | { t: 'knocked'; cardId: number; cell: number; by: number }
  /** Пульсар зарядился от вспышек рядом: `total` — множитель ко всем линиям до конца ночи. */
  | { t: 'pulse'; cell: number; amount: number; total: number }
  | { t: 'gold'; amount: number; goldAfter: number }
  | { t: 'omenChanged'; uid: number }
  | { t: 'nightWon' }
  | { t: 'nightLost'; reason: 'moves' | 'cards' };
