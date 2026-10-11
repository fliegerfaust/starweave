export type PointerKind = 'down' | 'move' | 'up' | 'cancel';

export interface PointerEventData {
  kind: PointerKind;
  id: number;
  x: number;
  y: number;
}

/** Нормализует мышь и касания в поток событий с координатами в CSS-пикселях канваса. */
export class PointerInput {
  private listeners: ((e: PointerEventData) => void)[] = [];
  x = -1;
  y = -1;

  constructor(private readonly el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      this.emit('down', e);
    });
    el.addEventListener('pointermove', (e) => this.emit('move', e));
    el.addEventListener('pointerup', (e) => this.emit('up', e));
    el.addEventListener('pointercancel', (e) => this.emit('cancel', e));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.x = -1;
        this.y = -1;
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(fn: (e: PointerEventData) => void): void {
    this.listeners.push(fn);
  }

  private emit(kind: PointerKind, e: PointerEvent): void {
    const rect = this.el.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
    const data = { kind, id: e.pointerId, x: this.x, y: this.y };
    for (const fn of this.listeners) fn(data);
  }
}
