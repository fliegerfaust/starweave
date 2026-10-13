import { t } from '@/i18n';
import { h, type Child } from '@/ui/dom';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BubbleOptions {
  /** Текст кнопки «дальше»; без неё пузырь ждёт действия игрока. */
  next?: string;
  /** Где показать пузырь: сверху, снизу или подальше от подсветки. */
  place?: 'top' | 'bottom' | 'auto';
}

/**
 * Слой обучения поверх игры: затемнение с «окном» на нужный элемент, пузырь с
 * текстом и палец, показывающий жест. Сам слой клики не перехватывает — что
 * разрешено нажимать, решают сцена и экраны.
 */
export class TutorialOverlay {
  private readonly root: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly finger: HTMLElement;
  private readonly progress: HTMLElement;
  private spotRect: Rect | null = null;

  constructor(private readonly onSkip: () => void) {
    this.spot = h('div.tut-spot');
    this.finger = h('div.tut-finger', null, h('div.tut-finger-dot'));
    this.bubble = h('div.tut-bubble');
    this.progress = h('div.tut-progress');
    this.root = h('div.tut-layer', null, [this.spot, this.finger, this.bubble]);
    document.getElementById('ui')!.append(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Подсветить прямоугольник (null — без затемнения). */
  spotlight(rect: Rect | null, pad = 8): void {
    this.spotRect = rect;
    if (!rect) {
      this.spot.classList.remove('on');
      return;
    }
    Object.assign(this.spot.style, {
      left: `${rect.x - pad}px`,
      top: `${rect.y - pad}px`,
      width: `${rect.w + pad * 2}px`,
      height: `${rect.h + pad * 2}px`,
    });
    this.spot.classList.add('on');
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
    // Полоска вместо «1 / 24»: число шагов пугает при обещании «2 минуты»
    this.progress.style.setProperty('--p', String(step / total));
    this.progress.setAttribute('aria-label', `${step} / ${total}`);
  }

  /** Показать пузырь. Возвращает промис, который разрешится по кнопке «дальше». */
  say(content: Child | Child[], opts: BubbleOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      const body = h('div.tut-text', null, content);
      const skip = h('button.tut-skip', { type: 'button' }, t('tut.skip'));
      skip.addEventListener('click', () => this.onSkip());
      const actions = h('div.tut-actions', null, [this.progress, skip]);
      if (opts.next) {
        const next = h('button.btn.btn-primary.tut-next', { type: 'button' }, opts.next);
        next.addEventListener('click', () => resolve());
        actions.append(next);
      }
      this.bubble.replaceChildren(body, actions);
      this.bubble.classList.remove('top', 'bottom', 'pop');
      void this.bubble.offsetWidth;
      this.bubble.classList.add(this.placeFor(opts.place ?? 'auto'), 'pop', 'on');
      if (!opts.next) resolve();
    });
  }

  hideBubble(): void {
    this.bubble.classList.remove('on');
  }

  private placeFor(place: 'top' | 'bottom' | 'auto'): 'top' | 'bottom' {
    if (place !== 'auto') return place;
    const r = this.spotRect;
    if (!r) return 'bottom';
    return r.y + r.h / 2 > window.innerHeight / 2 ? 'top' : 'bottom';
  }
}

/** Прямоугольник DOM-элемента. */
export function elementRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
