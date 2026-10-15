import { t } from '@/i18n';
import { h, type Child } from '@/ui/dom';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BubbleOptions {
  /** Текст кнопки «дальше»; без неё подсказка ждёт действия игрока. */
  next?: string;
  /** Где показать, если ночи рядом нет (Обсерватория): сверху, снизу или подальше от цели. */
  place?: 'top' | 'bottom' | 'auto';
}

/** Где на ночи небо и рука — подсказка встаёт в просвет между ними или на шапку. */
export interface TutorialDock {
  boardBottom: number;
  handTop: number;
}

const SVG = 'http://www.w3.org/2000/svg';
const TICKS = 11;

/**
 * Слой обучения — «Нить к цели» (RD.9, выбор Дениса): лёгкое затемнение с окном на цель
 * и золотой рамкой, короткая подсказка и бегущая золотая нить от неё к цели — глаз ведёт
 * от слов к месту. Подсказка встаёт в просвет между небом и рукой; где просвета нет —
 * на шапку ночи (в этот момент она не нужна); в ландшафте — в левую колонку под шапкой.
 * Ни цель, ни рука подсказкой не закрываются. Сам слой клики не перехватывает.
 */
export class TutorialOverlay {
  private readonly root: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly finger: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly thread: SVGSVGElement;
  private spotRect: Rect | null = null;
  private place: BubbleOptions['place'] = 'auto';
  private dock: (() => TutorialDock | null) | null = null;

  constructor(private readonly onSkip: () => void) {
    this.spot = h('div.tut-spot');
    this.finger = h('div.tut-finger', null, h('div.tut-finger-dot'));
    this.bubble = h('div.tut-bubble', { attrs: { role: 'status', 'aria-live': 'polite' } });
    this.progress = h('span.tut-ticks', null, Array.from({ length: TICKS }, () => h('i')));
    this.thread = document.createElementNS(SVG, 'svg');
    this.thread.setAttribute('class', 'tut-thread');
    this.thread.setAttribute('aria-hidden', 'true');
    this.root = h('div.tut-layer', null, [this.spot, this.thread, this.finger, this.bubble]);
    document.getElementById('ui')!.append(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Ночь сообщает, где небо и рука (null — не ночь: Обсерватория, окна). */
  setDock(fn: (() => TutorialDock | null) | null): void {
    this.dock = fn;
  }

  /** Подсветить прямоугольник (null — без затемнения и нити). */
  spotlight(rect: Rect | null, pad = 8): void {
    this.spotRect = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : null;
    if (!this.spotRect) {
      this.spot.classList.remove('on');
    } else {
      const r = this.spotRect;
      Object.assign(this.spot.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      this.spot.classList.add('on');
    }
    if (this.bubble.classList.contains('on')) this.layout();
  }

  /** Палец: тап в точку или перетаскивание из `from` в `to`. */
  point(from: { x: number; y: number } | null, to?: { x: number; y: number }): void {
    if (!from) {
      this.finger.classList.remove('on', 'drag');
      return;
    }
    const end = to ?? from;
    this.finger.style.setProperty('--x1', `${from.x}px`);
    this.finger.style.setProperty('--y1', `${from.y}px`);
    this.finger.style.setProperty('--x2', `${end.x}px`);
    this.finger.style.setProperty('--y2', `${end.y}px`);
    this.finger.classList.toggle('drag', !!to);
    this.finger.classList.add('on');
  }

  setProgress(step: number, total: number): void {
    // Деления вместо «1 / 24»: число шагов пугает при обещании «2 минуты»
    const lit = Math.ceil((step / total) * TICKS);
    this.progress.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < lit));
    this.progress.setAttribute('aria-label', `${step} / ${total}`);
  }

  /** Показать подсказку. Возвращает промис, который разрешится по кнопке «дальше». */
  say(content: Child | Child[], opts: BubbleOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      const text = h('div.tut-text', null, content);
      const skip = h('button.tut-skip', { type: 'button', attrs: { 'aria-label': t('tut.skip') } }, t('tut.skipShort'));
      skip.addEventListener('click', () => this.onSkip());
      const actions = h('div.tut-actions', null, [this.progress, skip]);
      if (opts.next) {
        const next = h('button.btn.btn-primary.tut-next', { type: 'button' }, opts.next);
        next.addEventListener('click', () => resolve());
        actions.append(next);
      }
      this.place = opts.place ?? 'auto';
      this.bubble.replaceChildren(text, actions);
      this.bubble.classList.remove('pop');
      this.bubble.classList.add('on');
      this.layout();
      void this.bubble.offsetWidth;
      this.bubble.classList.add('pop');
      if (!opts.next) resolve();
    });
  }

  hideBubble(): void {
    this.bubble.classList.remove('on');
    this.thread.replaceChildren();
  }

  /** Пересчитать место подсказки и нить (после поворота экрана или смены цели). */
  layout(): void {
    const b = this.bubble;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hud = document.querySelector('.hud')?.getBoundingClientRect() ?? null;
    const dock = this.dock?.() ?? null;
    const spot = this.spotRect;
    const landscape = document.body.classList.contains('landscape');
    const overlaps = (top: number, height: number) => !!spot && top < spot.y + spot.h && top + height > spot.y;
    b.style.width = '';
    b.style.minHeight = '';
    b.style.left = '';
    b.style.top = '';
    b.style.bottom = '';
    let top: number;
    if (dock && hud && landscape) {
      // Ландшафт и ПК: левая колонка под шапкой — там пусто
      b.style.width = `${hud.width}px`;
      b.style.left = `${hud.left}px`;
      // Колонка своя — цель на небе справа её не касается
      top = hud.bottom + 8;
    } else if (dock && hud) {
      const height = b.offsetHeight;
      const inGap = dock.handTop - height - 12;
      if (inGap >= dock.boardBottom + 6 && !overlaps(inGap, height)) top = inGap;
      else if (!overlaps(hud.top, height)) {
        // Просвета нет — на шапку, во всю её ширину
        b.style.width = `${hud.width}px`;
        b.style.minHeight = `${hud.height}px`;
        b.style.left = `${hud.left}px`;
        top = hud.top;
      } else top = Math.max(hud.bottom + 6, dock.handTop - height - 12);
    } else {
      // Не ночь (Обсерватория): сверху или снизу — подальше от цели
      const want = this.place !== 'auto' ? this.place : spot && spot.y + spot.h / 2 > vh / 2 ? 'top' : 'bottom';
      top = want === 'top' ? 10 + safeTop() : vh - b.offsetHeight - 10 - safeBottom();
    }
    b.style.top = `${Math.round(top)}px`;
    this.drawThread(vw);
  }

  /** Нить от края подсказки к цели: бегущий золотой пунктир и точка у цели. */
  private drawThread(vw: number): void {
    const spot = this.spotRect;
    if (!spot || !this.bubble.classList.contains('on')) {
      this.thread.replaceChildren();
      return;
    }
    const b = this.bubble.getBoundingClientRect();
    const tx = Math.min(Math.max(b.left + b.width / 2, spot.x + 12), spot.x + spot.w - 12);
    let d: string;
    let end: { x: number; y: number };
    if (b.right < spot.x) {
      // Подсказка слева от цели (ландшафт): нить вбок
      const sy = b.top + b.height / 2;
      end = { x: spot.x - 2, y: spot.y + spot.h / 2 };
      d = `M${b.right} ${sy} C ${b.right + 60} ${sy}, ${end.x - 60} ${end.y}, ${end.x} ${end.y}`;
    } else {
      const below = b.top >= spot.y + spot.h;
      const sx = b.left + b.width / 2;
      const sy = below ? b.top : b.bottom;
      end = { x: tx, y: below ? spot.y + spot.h + 2 : spot.y - 2 };
      const mid = (sy + end.y) / 2;
      d = `M${sx} ${sy} C ${sx} ${mid}, ${end.x} ${mid}, ${end.x} ${end.y}`;
    }
    this.thread.setAttribute('viewBox', `0 0 ${vw} ${window.innerHeight}`);
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', String(end.x));
    dot.setAttribute('cy', String(end.y));
    dot.setAttribute('r', '3.5');
    this.thread.replaceChildren(path, dot);
  }
}

const safeTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
const safeBottom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;

/** Прямоугольник DOM-элемента. */
export function elementRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
