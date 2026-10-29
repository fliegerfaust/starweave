/**
 * Каталог событий аналитики. Каждое событие — имя и типизированные параметры:
 * опечатка в имени или параметре ловится компилятором, а этот файл — единый
 * справочник для настройки целей в Метрике и отчётов.
 */
export interface EventMap {
  /** Запуск игры. */
  app_open: { platform: string; lang: string; returning: boolean; source?: string; challenge?: boolean };

  // ── Вызов другу ────────────────────────────────────────────────────────
  /** Отправил вызов: на каком итоге. */
  challenge_share: { ante: number; best: number; won: boolean };
  /** Открыл игру по вызову и увидел окно вызова. */
  challenge_open: { ante: number; best: number; fresh: boolean };
  challenge_accept: { ante: number; best: number };
  /** Доиграл забег по вызову: 1 — побил, 0 — ничья, −1 — нет. */
  challenge_result: { ante: number; best: number; their_ante: number; their_best: number; outcome: number };

  // ── Воронка новичка ────────────────────────────────────────────────────
  tutorial_start: { source: 'auto' | 'offer' | 'menu' | 'retry' };
  tutorial_step: { step: string; index: number };
  tutorial_skip: { step: string; index: number };
  tutorial_complete: Record<string, never>;

  // ── Забег и ночи ───────────────────────────────────────────────────────
  run_start: { sky: string; stake: number; daily: boolean; archive?: boolean; gentle?: boolean; gift?: boolean; replay?: boolean; challenge?: boolean };
  night_start: { ante: number; night: string; boss: string; gentle?: boolean };
  combo_found: { combo: string; count: number; ante: number };
  myth_found: { myth: string; count: number; ante: number };
  resonance_fuse: { id: string; ante: number };
  night_end: {
    ante: number;
    night: string;
    boss: string;
    won: boolean;
    score: number;
    target: number;
    /** Счёт / цель — главный показатель баланса. */
    ratio: number;
    moves_left: number;
    burns_left: number;
    lines: number;
  };
  run_end: { result: 'lost' | 'abandon' | 'victory'; ante: number; nights: number; lines: number; best: number; crosses: number; omens: string };

  // ── Экономика ──────────────────────────────────────────────────────────
  shop_buy: { kind: string; id: string; price: number; ante: number; gold_left: number };
  shop_sell: { id: string; ante: number };
  /** Услуга «Убрать карту» в Обсерватории. */
  shop_banish: { ante: number };
  shop_reroll: { cost: number; ante: number };
  pack_choose: { pack: string; id: string };
  /** Дар ночи (GF.2): что взято и какой была колода до него. */
  gift_take: { kind: string; id: string; ante: number; deck: number };
  gift_skip: { ante: number; deck: number };
  /** После Затмения (TR.2): приручил (trophy) или взял парное Знамение (omen). */
  trophy_take: { kind: string; id: string; ante: number };
  /** Комета или Телескоп (RT.4): взял вариант или прошёл мимо. */
  wonder: { kind: string; ante: number };

  // ── Монетизация ────────────────────────────────────────────────────────
  ad_request: { kind: 'rewarded' | 'interstitial' | 'preloader'; placement: string };
  /** Чем кончился показ (PK.15): `nofill` — у площадки не было ролика, `reason` — её код. */
  ad_result: { kind: 'rewarded' | 'interstitial' | 'preloader'; placement: string; result: 'rewarded' | 'shown' | 'closed' | 'nofill' | 'error'; reason?: string };
  /** Открыт экран атласа (магазина): откуда пришли. */
  store_open: { from: string };
  purchase_start: { product: string };
  purchase_result: { product: string; result: 'paid' | 'cancelled' | 'failed' | 'unavailable' };

  // ── Понятность ─────────────────────────────────────────────────────────
  guide_open: { focus: string };
  /** Коллекция (CL.2): с полки на главной, из Библиотеки или по фокусу находки. */
  collection_open: { focus: string };
  // ── Зал славы (HF) ─────────────────────────────────────────────────────
  /** Открыл «Зал славы»: сколько достижений открыто, пришли ли доли с сервера. */
  hall_open: { feats: number; shares: boolean };
  /** Снимок для долей игроков: маска открытых достижений и рекорды (см. meta/hall-sync.ts). */
  hall_snap: { f: number; bm: number; ba: number; w: number; l: number; e: number; st: number };
  /** Открыл достижение. */
  feat_unlock: { id: string; runs: number };
  /** Крючок в Коллекцию (CL.3): из итогов забега или с баннера мифа. */
  collection_hook: { from: 'over' | 'banner'; kind: string; n: number };

  // ── Техника ────────────────────────────────────────────────────────────
  perf: { fps: number; dpr: number; width: number; height: number };
  /** where — файл:строка:колонка; пусто у «Script error.» (чужой скрипт без CORS). */
  /** stack — короткий стек (`функция@файл:строка:колонка` по строкам), только у первых повторов. */
  js_error: { message: string; where: string; stack?: string };
  /** Браузер выбросил холсты в фоне, игра их перерисовала (BG.1): сколько и чем замечено. */
  canvas_restore: { canvases: number; by: 'event' | 'canary' };
}

export type EventName = keyof EventMap;
