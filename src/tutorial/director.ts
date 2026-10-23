import { TUTORIAL_CELLS, cardCode } from '@/core/tutorial';
import type { GameEvent } from '@/core/types';
import type { App } from '@/game/app';
import type { NightScene } from '@/game/night/scene';
import { t } from '@/i18n';
import type { Dict } from '@/i18n/ru';
import { h } from '@/ui/dom';
import type { Hud } from '@/ui/hud';
import { center, elementRect, TutorialOverlay, type Rect } from './overlay';
import { track } from '@/analytics';
import type { TutorialStep } from '@/ui/tutorial';

/** Реплика обучения — строка из `tut` словаря (без вложенных таблиц). */
type Tut = Dict['tut'];
type TutKey = { [K in keyof Tut]: Tut[K] extends string ? K : never }[keyof Tut] & string;

/** Что экраны сообщают режиссёру. */
export type TutorialEvent =
  | { type: 'night'; scene: NightScene; hud: Hud }
  | { type: 'dealt' }
  | { type: 'settled'; events: GameEvent[] }
  | { type: 'reward'; panel: HTMLElement }
  | { type: 'shop'; root: HTMLElement }
  | { type: 'shopChanged' };

type Waiter = { pred: (e: TutorialEvent) => boolean; resolve: (e: TutorialEvent, seq: number) => void };

const TOTAL_STEPS = 22;
/** Короткое обучение первого запуска — только первая ночь, до её награды. */
const SHORT_STEPS = 14;
/** Шагов в короткой первой ночи (CQ.4) по вариантам витрины, с наградой. */
const COMPACT_STEPS = { a: 7, b: 9, c: 6 } as const;

/** Шаг обучения → плашка первых забегов о том же: пройденное после «Пропустить» не повторяем. */
const TAUGHT: Partial<Record<string, TutorialStep[]>> = {
  place1: ['place'],
  almost: ['fillLine'],
  target: ['target'],
  combos: ['combos'],
  burn: ['burn'],
  crossCell: ['cross'],
  shop: ['shop'],
  // Короткая первая ночь (CQ.4)
  shortRow: ['place', 'fillLine'],
  shortBurn: ['burn'],
  shortCross: ['cross'],
};

/** Общий прямоугольник двух областей. */
function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Режиссёр обучения: сценарий — обычная асинхронная функция, которая ждёт
 * событий экранов («карта положена», «открылась Обсерватория») и управляет
 * подсветкой, пузырём и ограничениями хода.
 */
export class TutorialDirector {
  private readonly overlay: TutorialOverlay;
  private waiters: Waiter[] = [];
  private scene: NightScene | null = null;
  private hud: Hud | null = null;
  private shopRoot: HTMLElement | null = null;
  private step = 0;
  private stopped = false;
  /**
   * События запоминаются: экран может сообщить о награде раньше, чем сценарий
   * начнёт её ждать. `cursor` — последнее событие, которое сценарий уже «прочитал».
   */
  private history: { seq: number; e: TutorialEvent }[] = [];
  private seq = 0;
  private cursor = 0;

  /** Таймеры текущего шага — гасятся при остановке, чтобы не жили после пропуска. */
  private timers = new Set<number>();
  /** Пересчитать подсветку и палец текущего шага (после поворота экрана). */
  private reposition: (() => void) | null = null;
  private readonly onResize = () => window.setTimeout(() => {
    this.reposition?.();
    this.overlay.layout();
  }, 60);

  /** Шагов в сценарии: полоса прогресса заполняется к концу именно этого обучения. */
  private readonly total: number;
  /** Короткая первая ночь (CQ.4) и её вариант для витрины; null — полная. */
  private readonly compact: 'a' | 'b' | 'c' | null;

  constructor(private readonly app: App, short = false) {
    const v = import.meta.env.DEV ? new URLSearchParams(location.search).get('tv') : null;
    this.compact = app.features.shortTutorial ? (v === 'b' || v === 'c' ? v : 'a') : null;
    const night1 = this.compact ? COMPACT_STEPS[this.compact] : SHORT_STEPS;
    this.total = short ? night1 : night1 + (TOTAL_STEPS - SHORT_STEPS);
    this.overlay = new TutorialOverlay(() => this.app.runs.skipTutorial());
    window.addEventListener('resize', this.onResize);
  }

  private every(ms: number, fn: () => void): number {
    const id = window.setInterval(fn, ms);
    this.timers.add(id);
    return id;
  }

  private clear(id: number): void {
    window.clearInterval(id);
    this.timers.delete(id);
  }

  emit(e: TutorialEvent): void {
    if (e.type === 'night') {
      this.scene = e.scene;
      this.hud = e.hud;
      // Меню, «?», колода и «Сжечь» — только когда шаг о них (TU: справочник открывался посреди шага)
      e.hud.setTutorialLock(true);
      // Подсказка встаёт в просвет между небом и рукой (или на шапку)
      const scene = e.scene;
      this.overlay.setDock(() => {
        const board = scene.layout.board;
        return { boardBottom: board.y + board.h, handTop: scene.handAreaRect().y };
      });
    }
    if (e.type === 'shop') {
      this.shopRoot = e.root;
      this.overlay.setDock(null);
    }
    const seq = ++this.seq;
    this.history.push({ seq, e });
    if (this.history.length > 50) this.history.shift();
    const ready = this.waiters.find((w) => w.pred(e));
    if (ready) {
      this.waiters = this.waiters.filter((w) => w !== ready);
      ready.resolve(e, seq);
    }
  }

  /** Забыть уже случившееся: следующее ожидание — только новых событий. */
  private sync(): void {
    this.cursor = this.seq;
  }

  private waitFor<T extends TutorialEvent['type']>(type: T, pred: (e: Extract<TutorialEvent, { type: T }>) => boolean = () => true): Promise<Extract<TutorialEvent, { type: T }>> {
    const match = (e: TutorialEvent) => e.type === type && pred(e as Extract<TutorialEvent, { type: T }>);
    const past = this.history.find((x) => x.seq > this.cursor && match(x.e));
    if (past) {
      this.cursor = past.seq;
      return Promise.resolve(past.e as Extract<TutorialEvent, { type: T }>);
    }
    return new Promise((resolve) => {
      this.waiters.push({
        pred: match,
        resolve: (e, seq) => {
          this.cursor = seq;
          resolve(e as Extract<TutorialEvent, { type: T }>);
        },
      });
    });
  }

  stop(): void {
    this.stopped = true;
    this.hud?.setTutorialLock(false);
    this.waiters = [];
    for (const id of this.timers) window.clearInterval(id);
    this.timers.clear();
    window.removeEventListener('resize', this.onResize);
    this.overlay.destroy();
    this.scene?.setGuide(null);
    this.scene?.setStepPause(1);
    // Пауза первого подсчёта не должна пережить обучение: иначе подсчёт после «Пропустить» зависнет
    this.scene?.setScoringGate(null);
    this.releaseGate?.();
    this.releaseGate = null;
    this.shopRoot?.classList.remove('tut-lock');
  }

  start(): void {
    void this.script().catch((e: unknown) => {
      if (!this.stopped) throw e;
    });
  }

  // ─── Примитивы ──────────────────────────────────────────────────────────

  /** Где сейчас игрок — для аналитики пропуска обучения. */
  progress = { step: 'start', index: 0 };

  /** Плашки первых забегов, которые обучение уже объяснило. */
  readonly taught = new Set<TutorialStep>();

  private mark(step: string): void {
    this.progress = { step, index: this.step };
    for (const coach of TAUGHT[step] ?? []) this.taught.add(coach);
    track('tutorial_step', this.progress);
  }

  private async say(key: TutKey, opts: { spot?: Rect | null; next?: boolean; extra?: Node | null; vars?: Record<string, string | number> } = {}): Promise<void> {
    if (this.stopped) throw new Error('stopped');
    this.step += 1;
    this.mark(key);
    this.overlay.setProgress(Math.min(this.step, this.total), this.total);
    this.overlay.spotlight(opts.spot ?? null);
    this.reposition = null;
    const text = t(`tut.${key}`, opts.vars);
    await this.overlay.say([h('div', null, text), opts.extra ?? null], { next: opts.next === false ? undefined : t('tut.next') });
  }

  private get night() {
    return this.scene!;
  }

  private cardId(code: string): number {
    const card = this.app.run!.night!.hand.find((c) => cardCode(c) === code);
    if (!card) throw new Error(`Нет в руке: ${code}`);
    return card.id;
  }

  /** Попросить положить карту в клетку: подсветка, палец, ограничение. */
  /** `key` null — подсказка прежняя (ряд под одной фразой), меняется только цель. */
  private async guidePlace(key: TutKey | null, code: string, cell: number, place: 'top' | 'bottom' | 'auto' = 'top'): Promise<GameEvent[]> {
    const scene = this.night;
    const id = this.cardId(code);
    this.sync();
    scene.setGuide({ card: id, cell });
    this.step += 1;
    if (key) this.mark(key);
    this.overlay.setProgress(Math.min(this.step, this.total), this.total);
    // Цель — клетка: рамка и нить ведут к ней, палец показывает жест
    this.overlay.spotlight(scene.cellRect(cell), 4);
    this.reposition = () => {
      const from = scene.handRect(id);
      this.overlay.spotlight(scene.cellRect(cell), 4);
      if (from && !scene.busy) this.overlay.point(center(from), center(scene.cellRect(cell)));
    };
    this.reposition();
    if (key) await this.overlay.say(t(`tut.${key}`), { place });
    else this.overlay.showBubble();
    // Как только карта легла — убираем пузырь, чтобы он не закрывал подсчёт
    const watch = this.every(50, () => {
      if (scene.busy) {
        this.overlay.hideBubble();
        this.overlay.point(null);
        this.clear(watch);
      }
    });
    const { events } = await this.waitFor('settled', (e) => e.events.some((x) => x.t === 'place'));
    this.clear(watch);
    this.reposition = null;
    this.overlay.point(null);
    this.overlay.spotlight(null);
    scene.setGuide({});
    return events;
  }

  // ─── Сценарий ───────────────────────────────────────────────────────────

  private async script(): Promise<void> {
    // Ночь 1
    await this.waitFor('night');
    await this.waitFor('dealt');
    const scene = this.night;
    if (this.compact) await this.compactNight(scene, this.compact);
    else await this.fullNight(scene);

    // Награда
    const reward = await this.waitFor('reward');
    scene.setStepPause(1);
    // Экран итогов говорит сам за себя: без подсказки и нити, светится только «Забрать» (TU.2)
    this.step += 1;
    this.mark('reward');
    this.overlay.hideBubble();
    this.overlay.spotlight(null);
    reward.panel.querySelector<HTMLElement>('.btn')?.classList.add('tut-allow');

    // Обсерватория
    const shop = await this.waitFor('shop');
    const root = shop.root;
    root.classList.add('tut-lock');
    await pause(400);
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    await this.say('shop', { spot: elementRect(q('[data-shop="omens"]')) });
    const allow = (sel: string) => q(sel)?.querySelector('.btn')?.classList.add('tut-allow');
    allow('[data-shop="omen-0"]');
    await this.say('buyOmen', { spot: elementRect(q('[data-shop="omen-0"]')), next: false });
    await this.waitFor('shopChanged', () => this.app.run!.omens.length > 0);
    // Слоты Знамений внизу, под липкой панелью кнопок — сначала прокрутить их на середину
    q('[data-shop="owned"]')?.scrollIntoView({ block: 'center' });
    await pause(350);
    await this.say('omenSlot', { spot: elementRect(q('[data-shop="owned"]')) });
    q('[data-shop="next"]')?.classList.add('tut-allow');
    await this.say('toNight', { spot: elementRect(q('[data-shop="next"]')), next: false });

    // Ночь 2 — Знамение в деле (магазин заперт, пока игрок не ушёл из него)
    await this.waitFor('night');
    // Рамка с кнопки Обсерватории не висит над раздачей
    this.overlay.hideBubble();
    this.overlay.spotlight(null);
    root.classList.remove('tut-lock');
    await this.waitFor('dealt');
    const scene2 = this.night;
    scene2.setExplain(true);
    scene2.setGuide({});
    await this.say('night2', { spot: elementRect(document.querySelector('.hud-omens')) });
    scene2.setGuide({ free: true });
    // Сам играет — сжигать можно и кнопкой
    this.hud!.setTutorialLock(true, true);
    scene2.setStepPause(2.2);
    this.sync();
    const playArea = () => union(scene2.layout.board, scene2.handAreaRect());
    await this.say('freePlay', { next: false, spot: playArea() });
    // Рука и стол подсвечены вместе, палец показывает: из руки — на небо
    this.reposition = () => {
      if (scene2.night.placements > 0 || this.formulaShown) return;
      this.overlay.spotlight(playArea());
      this.overlay.point(center(scene2.handAreaRect()), center(scene2.layout.board));
    };
    this.reposition();
    const hideFinger = this.every(100, () => {
      if (scene2.busy || scene2.night.placements > 0) {
        this.overlay.point(null);
        this.clear(hideFinger);
      }
    });
    await this.waitFor('settled', (e) => e.events.some((x) => x.t === 'ignite'));
    this.reposition = null;
    scene2.setStepPause(1);
    if (this.app.run?.phase === 'night') {
      scene2.setGuide({});
      await this.say('omenWorked');
      scene2.setGuide({ free: true });
      await this.say('finish', { next: false });
    }
    await this.waitFor('reward');
    this.overlay.hideBubble();
    this.overlay.spotlight(null);
    this.app.runs.finishTutorial();
  }

  /** Первая ночь целиком: обзор, Пара с разбором формулы, цель, «?», сжигание, крест. */
  private async fullNight(scene: NightScene): Promise<void> {
    this.watchFormula();
    scene.setExplain(true);
    scene.setGuide({});
    scene.setStepPause(2.4);

    // В ландшафте и на ПК рука справа от неба, а не под ним
    await this.say(scene.layout.mode === 'landscape' ? 'boardSide' : 'board', { spot: union(scene.layout.board, scene.handAreaRect()) });
    await this.guidePlace('place1', '3s', TUTORIAL_CELLS.pairRow[0]);
    await this.guidePlace('place2', '3m', TUTORIAL_CELLS.pairRow[1]);
    await this.guidePlace('place3', '7t', TUTORIAL_CELLS.pairRow[2]);
    await this.say('almost', { spot: scene.cellsRect(TUTORIAL_CELLS.pairRow) });
    this.overlay.hideBubble();
    await this.guidePlace('place4', '5c', TUTORIAL_CELLS.pairRow[3], 'top');

    await this.say('target', { spot: elementRect(document.querySelector('.hud-row.mid')) });
    await this.say('combos', { spot: elementRect(this.hud!.guideBtn) });

    await this.burnStep(scene, 'burn');

    // Крест
    await this.say('prepare');
    this.overlay.hideBubble();
    scene.setStepPause(1);
    // Почти всё раскладываем сами, последнюю карту подготовки кладёт игрок: крест он
    // строит своими руками, а не смотрит со стороны
    const setup = TUTORIAL_CELLS.crossSetup;
    for (const step of setup.slice(0, -1)) {
      scene.setGuide(null);
      const index = this.app.run!.night!.hand.findIndex((c) => cardCode(c) === step.card);
      await scene.place(index, step.cell);
      scene.setGuide({});
    }
    const last = setup[setup.length - 1]!;
    await this.guidePlace('setupLast', last.card, last.cell, 'top');
    scene.setStepPause(2);
    await this.say('crossCell', { spot: scene.cellRect(TUTORIAL_CELLS.cross.cell) });
    this.overlay.hideBubble();
    await this.guidePlace('cross', TUTORIAL_CELLS.cross.card, TUTORIAL_CELLS.cross.cell, 'top');
  }

  /**
   * Короткая первая ночь (CQ.4, `shortTutorial`), витрина — три варианта:
   * `a` — только действия: ряд, сжечь, крест; формулу показывает сам подсчёт;
   * `b` — обзор и формула одной строкой, без цели и «?»; крест игрок достраивает сам;
   * `c` — как `a`, но без сжигания: о нём потом скажет подсказка первых забегов.
   */
  private async compactNight(scene: NightScene, variant: 'a' | 'b' | 'c'): Promise<void> {
    scene.setExplain(true);
    scene.setGuide({});
    if (variant === 'b') {
      this.watchFormula('shortFormula');
      scene.setStepPause(2.4);
      await this.say(scene.layout.mode === 'landscape' ? 'boardSide' : 'board', { spot: union(scene.layout.board, scene.handAreaRect()) });
    } else {
      // Без паузы на разбор: подписи и фишки подсчёта сами показывают, как растёт счёт
      this.watchFormula(null);
      scene.setStepPause(1.6);
    }
    // Ряд целиком под одной подсказкой: палец ведёт от карты к клетке, слова не меняются
    const row: [string, number][] = [['3s', TUTORIAL_CELLS.pairRow[0]], ['3m', TUTORIAL_CELLS.pairRow[1]], ['7t', TUTORIAL_CELLS.pairRow[2]], ['5c', TUTORIAL_CELLS.pairRow[3]]];
    for (const [i, [code, cell]] of row.entries()) await this.guidePlace(i === 0 ? 'shortRow' : null, code, cell);
    await this.waitIdle(scene);

    if (variant !== 'c') await this.burnStep(scene, 'shortBurn');

    // Крест: раскладываем сами, игрок кладёт карту на «×2» (в `b` — ещё и последнюю подготовки)
    scene.setStepPause(1);
    const setup = TUTORIAL_CELLS.crossSetup;
    const auto = variant === 'b' ? setup.slice(0, -1) : setup;
    for (const step of auto) {
      scene.setGuide(null);
      const index = this.app.run!.night!.hand.findIndex((c) => cardCode(c) === step.card);
      await scene.place(index, step.cell);
      scene.setGuide({});
    }
    if (variant === 'b') {
      const last = setup[setup.length - 1]!;
      await this.guidePlace('setupLast', last.card, last.cell, 'top');
    }
    scene.setStepPause(variant === 'b' ? 2 : 1.6);
    await this.guidePlace('shortCross', TUTORIAL_CELLS.cross.card, TUTORIAL_CELLS.cross.cell, 'top');
  }

  /** Сжечь единицу: палец ведёт карту на «Сжечь», ход не тратится. */
  private async burnStep(scene: NightScene, key: 'burn' | 'shortBurn'): Promise<void> {
    const bad = this.cardId('1m');
    scene.setGuide({ card: bad, burn: true });
    this.hud!.setTutorialLock(true, true);
    this.reposition = () => {
      const r = scene.handRect(bad);
      if (r) this.overlay.point(center(scene.selected !== null ? elementRect(this.hud!.burnBtn)! : r));
    };
    this.reposition();
    this.step += 1;
    this.overlay.setProgress(Math.min(this.step, this.total), this.total);
    this.mark(key);
    this.overlay.spotlight(elementRect(this.hud!.burnBtn), 4);
    this.sync();
    await this.overlay.say(t(`tut.${key}`), { place: 'top' });
    const burnBtn = this.hud!.burnBtn;
    const waitSelect = this.every(200, () => {
      this.overlay.point(center(scene.selected !== null ? elementRect(burnBtn)! : scene.handRect(bad) ?? elementRect(burnBtn)!));
    });
    await this.waitFor('settled', (e) => e.events.some((x) => x.t === 'burn'));
    this.clear(waitSelect);
    this.hud!.setTutorialLock(true);
    this.reposition = null;
    this.overlay.point(null);
    this.overlay.spotlight(null);
    scene.setGuide({});
  }

  /** Подсчёт прошлого хода закончился: следующая подсказка не ложится на него. */
  private async waitIdle(scene: NightScene): Promise<void> {
    while (scene.busy) await pause(80);
  }

  /** Пока идёт подсчёт — подсвечиваем формулу. */
  private formulaShown = false;
  /** Отпускает подсчёт, ждущий «Далее», если обучение остановили посреди паузы. */
  private releaseGate: (() => void) | null = null;

  /** `key` null — без паузы на разбор: подсчёт идёт сам, рамка только подсвечивает формулу. */
  private watchFormula(key: 'watchFormula' | 'shortFormula' | null = 'watchFormula'): void {
    // Первый подсчёт стоит на паузе, пока игрок не прочитает объяснение и не нажмёт «Далее»
    let gateOpen = false;
    if (key) this.night.setScoringGate(async () => {
      gateOpen = true;
      this.overlay.point(null);
      await Promise.race([
        this.overlay.say([h('div', null, t(`tut.${key}`))], { place: 'bottom', above: this.night.cellsRect(TUTORIAL_CELLS.pairRow), next: t('tut.next') }),
        new Promise<void>((resolve) => (this.releaseGate = resolve)),
      ]);
      this.releaseGate = null;
      this.overlay.hideBubble();
      gateOpen = false;
    });
    this.every(120, () => {
      const calc = document.querySelector('.calc.show');
      if (calc) {
        // Панель выезжает снизу на 14px — рамку и нить ставим сразу на её место, а не
        // догоняем рывками по тикам
        this.overlay.spotlight(settledRect(calc), 6);
        // Пузырь с прошлого шага не должен закрывать подсчёт
        if (!this.formulaShown && !gateOpen) this.overlay.hideBubble();
        this.formulaShown = true;
      } else if (this.formulaShown) {
        this.formulaShown = false;
        this.overlay.spotlight(null);
      }
    });
  }

}

/** Прямоугольник элемента без сдвига по Y из его текущей анимации появления. */
function settledRect(el: Element): Rect | null {
  const r = elementRect(el);
  if (!r) return null;
  const transform = getComputedStyle(el).transform;
  const shift = transform === 'none' ? 0 : new DOMMatrix(transform).m42;
  return { ...r, y: r.y - shift };
}
