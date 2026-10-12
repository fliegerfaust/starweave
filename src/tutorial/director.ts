import { COMBOS } from '@/core/content/combos';
import { TUTORIAL_CELLS, cardCode } from '@/core/tutorial';
import type { ComboId, GameEvent } from '@/core/types';
import type { App } from '@/game/app';
import type { NightScene } from '@/game/night/scene';
import { dict, t } from '@/i18n';
import { h } from '@/ui/dom';
import type { Hud } from '@/ui/hud';
import { center, elementRect, TutorialOverlay, type Rect } from './overlay';

/** Что экраны сообщают режиссёру. */
export type TutorialEvent =
  | { type: 'night'; scene: NightScene; hud: Hud }
  | { type: 'dealt' }
  | { type: 'settled'; events: GameEvent[] }
  | { type: 'reward'; panel: HTMLElement }
  | { type: 'shop'; root: HTMLElement }
  | { type: 'shopChanged' };

type Waiter = { pred: (e: TutorialEvent) => boolean; resolve: (e: TutorialEvent, seq: number) => void };

const TOTAL_STEPS = 24;

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
    this.shopRoot?.classList.remove('tut-lock');
  }

  start(): void {
    void this.script().catch((e: unknown) => {
      if (!this.stopped) throw e;
    });
  }

  // ─── Примитивы ──────────────────────────────────────────────────────────

  private async say(key: string, opts: { spot?: Rect | null; next?: boolean; extra?: Node | null; vars?: Record<string, string | number> } = {}): Promise<void> {
    if (this.stopped) throw new Error('stopped');
    this.step += 1;
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
    const scene = this.night;
    scene.setGuide({});
    scene.setStepPause(2.4);

    await this.say('board', { spot: scene.layout.board });
    await this.say('hand', { spot: scene.handAreaRect() });
    await this.guidePlace('place1', '3s', TUTORIAL_CELLS.pairRow[0]);
    await this.guidePlace('place2', '3m', TUTORIAL_CELLS.pairRow[1]);
    await this.guidePlace('place3', '7t', TUTORIAL_CELLS.pairRow[2]);
    await this.say('almost', { spot: scene.cellsRect(TUTORIAL_CELLS.pairRow) });
    this.overlay.hideBubble();
    await this.guidePlace('place4', '5c', TUTORIAL_CELLS.pairRow[3], 'top');

    await this.say('formula', { extra: this.formulaCard() });
    await this.say('target', { spot: elementRect(document.querySelector('.hud-row.mid')) });
    await this.say('combos', { extra: this.comboTable() });

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
    for (const step of TUTORIAL_CELLS.crossSetup) {
      scene.setGuide(null);
      const index = this.app.run!.night!.hand.findIndex((c) => cardCode(c) === step.card);
      await scene.place(index, step.cell);
      scene.setGuide({});
    }
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
    await this.say('items', { spot: elementRect(q('[data-shop="items"]')) });
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
    await this.say('freePlay', { next: false, spot: scene2.layout.board });
    await this.waitFor('settled', (e) => e.events.some((x) => x.t === 'ignite'));
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

  // ─── Наглядные вставки ─────────────────────────────────────────────────

  /** (10 + 18) × 2 = 56 — с подписями. */
  private formulaCard(): HTMLElement {
    const box = (cls: string, value: string, label: string) => h(`div.mini-box.${cls}`, null, [h('b', null, value), h('span', null, label)]);
    return h('div.tut-formula', null, [
      h('div.mini-formula', null, [
        box('light', '10 + 18', t('calc.light')),
        h('span', null, '×'),
        box('mult', '2', t('calc.mult')),
        h('span', null, '='),
        box('total', '56', t('calc.total')),
      ]),
      h('div.hint', null, t('tut.formulaNote')),
    ]);
  }

  /** Короткая таблица: чем реже сочетание — тем больше множитель. */
  private comboTable(): HTMLElement {
    const ids: ComboId[] = ['pair', 'twoPair', 'triple', 'straight', 'flush', 'quartet'];
    return h(
      'div.tut-combos',
      null,
      ids.map((id) => h('div.tut-combo', null, [h('span', null, t(`combo.${id}`)), h('span.tut-combo-desc', null, dict().comboDesc[id]), h('b.mult-text', null, `×${COMBOS[id].mult}`)])),
    );
  }
}
