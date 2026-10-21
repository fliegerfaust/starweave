import type { Entity } from '@/engine/ecs';
import type { PointerEventData } from '@/engine/input';
import { t } from '@/i18n';
import { CardView, Drawable, Layer, Transform } from '../components';
import type { Guide, NightScene } from './scene';

const DRAG_THRESHOLD = 8;

/**
 * Ввод ночи: касание и мышь (выбор, перетаскивание, бросок на «Сжечь»), клавиатура и
 * скринридер, наведение и ограничения обучения. Решение «ход сделан» передаёт сцене.
 */
export class SceneInput {
  /** Клетка, нажатая при выбранной карте: карта ляжет на отпускании пальца. */
  private pendingCell: number | null = null;
  private drag: { id: number; entity: Entity; startX: number; startY: number; active: boolean; offY: number } | null = null;
  hoverCell: number | null = null;
  private hoverHand: number | null = null;

  constructor(private readonly scene: NightScene) {}

  /** Карту выложили или сожгли в обход пальца (клавиатура, второй палец) — палец её больше не ведёт. */
  releaseIfDragging(cardId: number | undefined): void {
    if (this.drag && this.drag.id === cardId) this.dropDrag();
  }

  /** Палец, который тащит карту: второй палец не перехватывает перетаскивание. */
  private dragPointer: number | null = null;

  readonly onPointer = (e: PointerEventData): void => {
    if (this.scene.isDestroyed) return;
    if (e.kind === 'down') this.kbActive = false;
    if (this.drag && this.dragPointer !== null && e.id !== this.dragPointer && e.kind !== 'cancel') return;
    if (e.kind === 'down') this.dragPointer = e.id;
    else if (e.kind === 'up' || e.kind === 'cancel') this.dragPointer = null;
    this.scene.svc.audio.unlock();
    // Мышь едет без зажатой кнопки, а карта всё ещё «в руке» — отпускание потерялось
    // (окно потеряло фокус и т.п.). Отпускаем здесь, иначе карта ездит за курсором
    if (e.kind === 'move' && e.pointerType === 'mouse' && e.buttons === 0 && (this.drag || this.pendingCell !== null)) {
      this.dragPointer = null;
      return this.onUp(e.x, e.y);
    }
    if (e.kind === 'down') this.onDown(e.x, e.y);
    else if (e.kind === 'move') this.onMove(e.x, e.y, e.pointerType === 'touch');
    else if (e.kind === 'up') this.onUp(e.x, e.y);
    else if (e.kind === 'cancel') this.cancelDrag();
  };

  canPlaceAt(cell: number | null): cell is number {
    return cell !== null && !this.scene.night.sealed[cell] && this.scene.board[cell] === null;
  }

  /** Ограничение обучения (null — играем свободно). */
  guide: Guide | null = null;

  setGuide(guide: Guide | null): void {
    this.guide = guide;
    this.scene.cells.forEach((c, i) => {
      const on = guide?.cell === i ? 1 : 0;
      void this.scene.svc.tweens.to(c, { tut: on }, { duration: 0.25 });
    });
  }

  private allowSelect(handIndex: number): boolean {
    const g = this.guide;
    if (!g || g.free) return true;
    return g.card !== undefined && this.scene.hand[handIndex] === g.card;
  }

  allowPlace(handIndex: number, cell: number): boolean {
    const g = this.guide;
    if (!g || g.free) return true;
    return g.card === this.scene.hand[handIndex] && g.cell === cell;
  }

  deny(): void {
    this.scene.svc.audio.deny();
    this.scene.svc.haptics.play('error');
  }

  private onDown(x: number, y: number): void {
    // Идёт подсчёт: касание ускоряет его (кроме обучения — там подсчёт читают)
    if (this.scene.busy && !this.guide) this.scene.presenter.hurry = 3;
    if (this.scene.busy || this.scene.night.result !== 'playing') return;
    const index = this.scene.view.handIndexAt(x, y);
    if (index !== null) {
      if (!this.allowSelect(index)) return this.deny();
      const id = this.scene.hand[index]!;
      const entity = this.scene.cards.get(id)!;
      this.drag = { id, entity, startX: x, startY: y, active: false, offY: 0 };
      return;
    }
    const cell = this.scene.view.cellAt(x, y);
    if (this.scene.selected !== null && this.canPlaceAt(cell)) {
      // Кладём на отпускании пальца: можно передумать и увести палец с клетки
      this.pendingCell = cell;
      return;
    }
    if (cell === null && this.scene.selected !== null) this.scene.select(null);
  }

  private onMove(x: number, y: number, touch = true): void {
    const { renderer, starfield } = this.scene.svc;
    starfield.parallaxX = (x / renderer.width - 0.5) * 2;
    starfield.parallaxY = (y / renderer.height - 0.5) * 2;
    if (this.scene.busy) return;
    if (this.drag && !this.dragValid()) this.dropDrag();
    if (this.drag) {
      const d = this.drag;
      if (!d.active && Math.hypot(x - d.startX, y - d.startY) > DRAG_THRESHOLD) {
        d.active = true;
        const index = this.scene.hand.indexOf(d.id);
        this.scene.select(index, false);
        const v = this.scene.world.req(d.entity, CardView);
        v.zone = 'flying';
        v.lift = 0;
        this.scene.world.req(d.entity, Drawable).layer = Layer.Dragged;
        this.scene.svc.tweens.cancel(this.scene.world.req(d.entity, Transform));
        this.scene.svc.audio.pickup();
      }
      if (d.active) {
        const t = this.scene.world.req(d.entity, Transform);
        // Карта висит над пальцем, чтобы её было видно
        const lift = touch ? this.scene.layout.handH * 0.45 : 0;
        t.x = x;
        t.y = y - lift;
        t.rot = 0;
        const cell = this.scene.view.cellAt(t.x, t.y);
        const overBoard = cell !== null;
        const overBurn = !overBoard && this.overBurn(x, y);
        t.scale += ((overBoard ? this.scene.view.boardScale : overBurn ? 0.8 : 1) - t.scale) * 0.35;
        this.setHover(this.canPlaceAt(cell) ? cell : null);
        this.scene.hud.setBurnDrop(this.canBurnCard(d.id) ? (overBurn ? 'hover' : 'ready') : null);
      }
      return;
    }
    if (this.scene.selected !== null) {
      const cell = this.scene.view.cellAt(x, y);
      this.setHover(this.canPlaceAt(cell) ? cell : null);
    }
    if (!touch) this.setHandHover(this.scene.view.handIndexAt(x, y));
  }

  // ─── Клавиатура (десктоп, скринридер) ──────────────────────────────────

  /** Клетка под фокусом клавиатуры. */
  kbCell: number | null = null;
  /** Рамку фокуса рисуем, только пока играют с клавиатуры: мышь и касание её гасят. */
  private kbActive = false;

  /** Клетка с рамкой фокуса клавиатуры (null — играют мышью или пальцем). */
  get focusedCell(): number | null {
    return this.kbActive ? this.kbCell : null;
  }

  labelCanvas(): void {
    const c = this.scene.svc.renderer.canvas;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-roledescription', t('a11y.boardRole'));
    c.setAttribute('aria-label', t('a11y.board'));
    c.tabIndex = 0;
  }

  /**
   * 1–9 — карта руки, стрелки — клетка неба, Enter/пробел — положить, B/Delete — сжечь,
   * Esc — снять выбор. Те же ограничения обучения, что и у касаний. Пока открыто окно или
   * фокус в поле ввода, клавиши не наши.
   */
  readonly onKey = (e: KeyboardEvent): void => {
    if (this.scene.isDestroyed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) {
      // На кнопке Enter/пробел — её нажатие; цифры и стрелки всё равно наши
      if (e.key === 'Enter' || e.key === ' ') return;
    }
    const n = this.scene.night.rules.gridSize;
    const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
    let handled = true;
    if (digit >= 0) {
      if (digit < this.scene.hand.length && !this.scene.busy && this.scene.night.result === 'playing') {
        if (!this.allowSelect(digit)) this.deny();
        else this.scene.select(this.scene.selected === digit ? null : digit);
        this.announceSelection();
      }
    } else if (e.key.startsWith('Arrow')) {
      this.kbActive = true;
      const cur = this.kbCell ?? this.firstFreeCell();
      let r = Math.floor(cur / n);
      let c = cur % n;
      if (this.kbCell !== null) {
        if (e.key === 'ArrowUp') r = (r + n - 1) % n;
        else if (e.key === 'ArrowDown') r = (r + 1) % n;
        else if (e.key === 'ArrowLeft') c = (c + n - 1) % n;
        else if (e.key === 'ArrowRight') c = (c + 1) % n;
      }
      this.kbCell = r * n + c;
      if (this.scene.selected !== null) this.setHover(this.canPlaceAt(this.kbCell) ? this.kbCell : null);
      this.announceCell(this.kbCell);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this.scene.selected === null || this.kbCell === null || this.scene.busy) {
        this.deny();
        this.scene.hud.announce(t(this.scene.selected === null ? 'a11y.pickCard' : 'a11y.pickCell'));
      } else if (!this.canPlaceAt(this.kbCell)) this.deny();
      else void this.scene.place(this.scene.selected, this.kbCell);
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И' || e.key === 'Delete') {
      if (this.scene.selected !== null && this.canBurnCard(this.scene.hand[this.scene.selected]!)) void this.scene.burnSelected();
      else this.deny();
    } else if (e.key === 'Escape') {
      if (this.scene.selected !== null) this.scene.select(null);
      else handled = false;
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private firstFreeCell(): number {
    const i = this.scene.night.grid.findIndex((c, k) => !c && !this.scene.night.sealed[k]);
    return i >= 0 ? i : 0;
  }

  /** Скринридеру: какая карта выбрана и где она даст больше всего. */
  private announceSelection(): void {
    const i = this.scene.selected;
    if (i === null) return this.scene.hud.announce(t('a11y.deselected'));
    const card = this.scene.night.hand[i]!;
    const name = this.scene.night.rules.hideRanks ? t(`suitPl.${card.suit}`) : `${card.rank} · ${t(`suitPl.${card.suit}`)}`;
    const best = this.scene.cells.findIndex((c) => c.forecast.length > 0 && !c.forecastWeak);
    const where = best >= 0 ? t('a11y.bestCell', { cell: this.cellName(best), combo: this.scene.cells[best]!.forecast.map((f) => f.name).join(' + ') }) : '';
    this.scene.hud.announce(`${t('a11y.selected', { card: name })} ${where}`.trim());
  }

  /** Скринридеру: что в клетке и что даст выбранная карта. */
  private announceCell(cell: number): void {
    const placed = this.scene.night.grid[cell];
    const what = this.scene.night.sealed[cell]
      ? t('a11y.sealed')
      : placed
        ? `${placed.rank} · ${t(`suitPl.${placed.suit}`)}`
        : this.scene.forecast.preview
          ? `${t('a11y.empty')}. ${this.scene.forecast.preview.lines.map((l) => t(`combo.${l.combo}`)).join(' + ')} ≈ ${this.scene.forecast.preview.total}`
          : t('a11y.empty');
    this.scene.hud.announce(`${this.cellName(cell)}: ${what}`);
  }

  private cellName(cell: number): string {
    const n = this.scene.night.rules.gridSize;
    return t('a11y.cell', { row: Math.floor(cell / n) + 1, col: (cell % n) + 1 });
  }

  /** Наведение мышью на карту руки: лёгкий подъём. */
  private setHandHover(index: number | null): void {
    if (index === this.hoverHand) return;
    this.hoverHand = index;
    this.scene.hand.forEach((id, i) => {
      const e = this.scene.cards.get(id);
      if (e === undefined) return;
      const v = this.scene.world.req(e, CardView);
      if (v.zone !== 'hand') return;
      const target = i === this.scene.selected ? this.scene.view.liftAmount : i === index ? this.scene.view.liftAmount * 0.35 : 0;
      void this.scene.svc.tweens.to(v, { lift: target }, { duration: 0.12 });
    });
    this.scene.svc.renderer.canvas.style.cursor = index !== null || this.hoverCell !== null ? 'pointer' : 'default';
  }

  private onUp(x: number, y: number): void {
    const pending = this.pendingCell;
    this.pendingCell = null;
    if (pending !== null && this.scene.selected !== null && !this.scene.busy && this.scene.view.cellAt(x, y) === pending) {
      void this.scene.place(this.scene.selected, pending);
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || this.scene.busy) return;
    if (!this.scene.world.isAlive(d.entity) || !this.scene.hand.includes(d.id)) return this.scene.hud.setBurnDrop(null);
    if (!d.active) {
      const index = this.scene.hand.indexOf(d.id);
      this.scene.select(this.scene.selected === index ? null : index);
      return;
    }
    const t = this.scene.world.req(d.entity, Transform);
    const cell = this.scene.view.cellAt(t.x, t.y);
    const index = this.scene.hand.indexOf(d.id);
    this.scene.hud.setBurnDrop(null);
    if (this.canPlaceAt(cell)) {
      void this.scene.place(index, cell, d.entity);
    } else if (cell === null && this.overBurn(x, y)) {
      // Карту бросили на «Сжечь» — то же, что выбрать и нажать кнопку
      if (this.canBurnCard(d.id)) {
        this.scene.selected = index;
        void this.scene.burnSelected();
      } else {
        this.deny();
        this.scene.select(index);
      }
    } else {
      this.setHover(null);
      this.scene.select(index);
    }
  }

  /**
   * Палец над кнопкой «Сжечь» (с запасом — по ней целятся на ходу). Над рукой — никогда:
   * карту, которую несут обратно в руку, не сжигаем (кнопка вплотную под правыми картами).
   */
  private overBurn(x: number, y: number): boolean {
    const r = this.scene.hud.burnBtn.getBoundingClientRect();
    const hand = this.scene.hand.length ? this.scene.view.handAreaRect() : null;
    if (hand && x >= hand.x && x <= hand.x + hand.w && y >= hand.y && y <= hand.y + hand.h) return false;
    const slack = 14;
    return x >= r.left - slack && x <= r.right + slack && y >= r.top - slack / 2 && y <= r.bottom + slack;
  }

  /** Можно ли сжечь карту перетаскиванием: остались сжигания и обучение не против. */
  canBurnCard(id: number): boolean {
    if (this.scene.night.burnsLeft <= 0) return false;
    return !this.guide || this.guide.free || (!!this.guide.burn && id === this.guide.card);
  }

  /**
   * Карта под пальцем ещё в руке. Её могли сжечь или выложить в обход перетаскивания —
   * вторым пальцем по «Сжечь», клавишей B или Enter; тогда сущность уже удалена, и каждое
   * движение пальца роняло ошибку «нет Transform» (js_error, 155 раз за день 14.10.2026).
   */
  private dragValid(): boolean {
    const d = this.drag;
    return !!d && this.scene.world.isAlive(d.entity) && this.scene.hand.includes(d.id) && this.scene.cards.get(d.id) === d.entity;
  }

  /** Бросить перетаскивание без возврата карты: она уже ушла из руки. */
  dropDrag(): void {
    this.drag = null;
    this.pendingCell = null;
    this.scene.hud.setBurnDrop(null);
    this.setHover(null);
  }

  private cancelDrag(): void {
    this.pendingCell = null;
    this.scene.hud.setBurnDrop(null);
    if (this.drag?.active) {
      this.setHover(null);
      void this.scene.view.layoutHand(true);
    }
    this.drag = null;
  }

  setHover(cell: number | null): void {
    if (cell !== this.hoverCell) {
      if (this.hoverCell !== null) void this.scene.svc.tweens.to(this.scene.cells[this.hoverCell]!, { hover: 0 }, { duration: 0.15 });
      if (cell !== null) {
        void this.scene.svc.tweens.to(this.scene.cells[cell]!, { hover: 1 }, { duration: 0.12 });
        this.scene.svc.audio.hover();
      }
      this.hoverCell = cell;
    }
    this.scene.forecast.showPlacement(this.scene.selected, this.hoverCell);
  }
}
