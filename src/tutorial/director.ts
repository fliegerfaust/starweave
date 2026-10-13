import { TUTORIAL_CELLS, cardCode } from '@/core/tutorial';
import type { GameEvent } from '@/core/types';
import type { App } from '@/game/app';
import type { NightScene } from '@/game/night/scene';
import { t } from '@/i18n';
import { h } from '@/ui/dom';
import type { Hud } from '@/ui/hud';
import { center, elementRect, TutorialOverlay, type Rect } from './overlay';
import { track } from '@/analytics';

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
  private readonly onResize = () => window.setTimeout(() => this.reposition?.(), 60);

  constructor(private readonly app: App) {
    this.overlay = new TutorialOverlay(() => this.app.skipTutorial());
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
    }
    if (e.type === 'shop') this.shopRoot = e.root;
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

  private mark(step: string): void {
    this.progress = { step, index: this.step };
    track('tutorial_step', this.progress);
  }

  private async say(key: string, opts: { spot?: Rect | null; next?: boolean; extra?: Node | null; vars?: Record<string, string | number> } = {}): Promise<void> {
    if (this.stopped) throw new Error('stopped');
    this.step += 1;
    this.mark(key);
    this.overlay.setProgress(Math.min(this.step, TOTAL_STEPS), TOTAL_STEPS);
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
  private async guidePlace(key: string, code: string, cell: number, place: 'top' | 'bottom' | 'auto' = 'top'): Promise<GameEvent[]> {
    const scene = this.night;
    const id = this.cardId(code);
    this.sync();
    scene.setGuide({ card: id, cell });
    this.step += 1;
    this.mark(key);
    this.overlay.setProgress(Math.min(this.step, TOTAL_STEPS), TOTAL_STEPS);
    this.overlay.spotlight(null);
    this.reposition = () => {
      const from = scene.handRect(id);
      if (from && !scene.busy) this.overlay.point(center(from), center(scene.cellRect(cell)));
    };
    this.reposition();
    await this.overlay.say(t(`tut.${key}`), { place });
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
    scene.setGuide({});
    return events;
  }

  // ─── Сценарий ───────────────────────────────────────────────────────────

  private async script(): Promise<void> {
    // Ночь 1
    await this.waitFor('night');
    await this.waitFor('dealt');
    this.watchFormula();
    const scene = this.night;
    scene.setGuide({});
    scene.setStepPause(2.4);

    await this.say('board', { spot: union(scene.layout.board, scene.handAreaRect()) });
    await this.guidePlace('place1', '3s', TUTORIAL_CELLS.pairRow[0]);
    await this.guidePlace('place2', '3m', TUTORIAL_CELLS.pairRow[1]);
    await this.guidePlace('place3', '7t', TUTORIAL_CELLS.pairRow[2]);
    await this.say('almost', { spot: scene.cellsRect(TUTORIAL_CELLS.pairRow) });
    this.overlay.hideBubble();
    await this.guidePlace('place4', '5c', TUTORIAL_CELLS.pairRow[3], 'top');

    await this.say('target', { spot: elementRect(document.querySelector('.hud-row.mid')) });
    await this.say('combos', { spot: elementRect(this.hud!.guideBtn) });

    // Сжигание
    const bad = this.cardId('1m');
    scene.setGuide({ card: bad, burn: true });
    this.reposition = () => {
      const r = scene.handRect(bad);
      if (r) this.overlay.point(center(scene.selected !== null ? elementRect(this.hud!.burnBtn)! : r));
    };
    this.reposition();
    this.step += 1;
    this.overlay.setProgress(this.step, TOTAL_STEPS);
    this.mark('burn');
    this.overlay.spotlight(null);
    this.sync();
    await this.overlay.say(t('tut.burn'), { place: 'top' });
    const burnBtn = this.hud!.burnBtn;
    const waitSelect = this.every(200, () => {
      this.overlay.point(center(scene.selected !== null ? elementRect(burnBtn)! : scene.handRect(bad) ?? elementRect(burnBtn)!));
    });
    await this.waitFor('settled', (e) => e.events.some((x) => x.t === 'burn'));
    this.clear(waitSelect);
    this.reposition = null;
    this.overlay.point(null);
    scene.setGuide({});

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

    // Награда
    const reward = await this.waitFor('reward');
    scene.setStepPause(1);
    await pause(400); // панель ещё «выпрыгивает» — меряем после анимации
    await this.say('reward', { spot: elementRect(reward.panel), next: false });
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
    await this.say('omenSlot', { spot: elementRect(q('[data-shop="owned"]')) });
    q('[data-shop="next"]')?.classList.add('tut-allow');
    await this.say('toNight', { spot: elementRect(q('[data-shop="next"]')), next: false });

    // Ночь 2 — Знамение в деле (магазин заперт, пока игрок не ушёл из него)
    await this.waitFor('night');
    root.classList.remove('tut-lock');
    await this.waitFor('dealt');
    const scene2 = this.night;
    scene2.setGuide({});
    await this.say('night2', { spot: elementRect(document.querySelector('.hud-omens')) });
    scene2.setGuide({ free: true });
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
    this.app.finishTutorial();
  }

  /** Пока идёт подсчёт — подсвечиваем формулу. */
  private formulaShown = false;
  /** Отпускает подсчёт, ждущий «Далее», если обучение остановили посреди паузы. */
  private releaseGate: (() => void) | null = null;

  private watchFormula(): void {
    // Первый подсчёт стоит на паузе, пока игрок не прочитает объяснение и не нажмёт «Далее»
    let gateOpen = false;
    this.night.setScoringGate(async () => {
      gateOpen = true;
      this.overlay.point(null);
      await Promise.race([
        this.overlay.say([h('div', null, t('tut.watchFormula'))], { place: 'bottom', next: t('tut.next') }),
        new Promise<void>((resolve) => (this.releaseGate = resolve)),
      ]);
      this.releaseGate = null;
      this.overlay.hideBubble();
      gateOpen = false;
    });
    this.every(120, () => {
      const calc = document.querySelector('.calc.show');
      if (calc) {
        // Панель появляется с анимацией — меряем на каждом тике
        this.overlay.spotlight(elementRect(calc), 6);
        // Пузырь с прошлого шага не должен закрывать подсчёт
        if (!this.formulaShown && !gateOpen) this.overlay.hideBubble();
        this.formulaShown = true;
      } else if (this.formulaShown) {
        this.formulaShown = false;
        this.overlay.spotlight(null);
      }
    });
  }

  // ─── Наглядные вставки ─────────────────────────────────────────────────



}
