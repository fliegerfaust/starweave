import type { RngState } from './rng';

// ─── Карты ─────────────────────────────────────────────────────────────────

export const SUITS = ['sun', 'moon', 'star', 'comet'] as const;
export type Suit = (typeof SUITS)[number];

export const MIN_RANK = 1;
export const MAX_RANK = 9;

export const GLYPHS = ['gilded', 'blazing', 'radiant', 'echo', 'glass', 'prism'] as const;
export type Glyph = (typeof GLYPHS)[number];

export interface Card {
  /** Уникален в пределах забега; по нему карта находится в колоде после копирования в ночь. */
  id: number;
  suit: Suit;
  rank: number;
  glyph?: Glyph;
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

export type StepSource =
  | { kind: 'combo'; combo: ComboId }
  | { kind: 'card'; cell: number; cardId: number }
  | { kind: 'glyph'; cell: number; cardId: number; glyph: Glyph }
  | { kind: 'omen'; uid: number; omenId: string; cell?: number }
  | { kind: 'boss'; bossId: string }
  | { kind: 'chain'; lines: number };

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

/** Открытый пакет: варианты на выбор (id Знамений, ритуалов или созвездий). */
export interface OpenPack {
  pack: PackKind;
  options: string[];
}

export interface ShopState {
  omens: ShopItem[];
  items: ShopItem[];
  packs: ShopItem[];
  rerollCost: number;
  openPack: OpenPack | null;
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
  /** 0..2 — Сумерки, Полночь, Затмение. */
  nightIndex: number;
  phase: RunPhase;
  gold: number;
  deck: Card[];
  nextCardId: number;
  omens: OmenInstance[];
  nextOmenUid: number;
  comboLevels: Record<ComboId, number>;
  /** Затмение каждого созвездия, разыграно заранее (видно на карте). */
  bosses: string[];
  night: NightState | null;
  reward: RewardSummary | null;
  shop: ShopState | null;
  stats: RunStats;
  endless: boolean;
  /** Звёздность (0 — обычная сложность). */
  stake?: number;
  /** Учебный забег: сценарная колода, без Затмений, две ночи. */
  tutorial?: boolean;
  /** Второй шанс уже использован в этом забеге. */
  revived?: boolean;
  /** В каком созвездии награду уже удваивали. */
  doubledAnte?: number;
  /** Сколько линий уже записано в профиль (забег после победы продолжается). */
  recordedLines?: number;
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
  | { t: 'shatter'; cardId: number; cell: number }
  | { t: 'gold'; amount: number; goldAfter: number }
  | { t: 'omenChanged'; uid: number }
  | { t: 'nightWon' }
  | { t: 'nightLost'; reason: 'moves' | 'cards' };
