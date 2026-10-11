/** Обёртка над Canvas2D: размер в CSS-пикселях, чёткость на ретине, тряска камеры. */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  private readonly resizeListeners: (() => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D недоступен');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  onResize(fn: () => void): void {
    this.resizeListeners.push(fn);
  }

  resize(): void {
    // Ограничиваем DPR: на телефонах с 3x канвас во весь экран слишком дорог.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.width && h === this.height && this.canvas.width === Math.round(w * this.dpr)) return;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    for (const fn of this.resizeListeners) fn();
  }

  /** Начало кадра: сброс трансформации с учётом DPR и смещения камеры. */
  begin(offsetX = 0, offsetY = 0): CanvasRenderingContext2D {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, offsetX * dpr, offsetY * dpr);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return ctx;
  }
}

/** Offscreen-канвас нужного размера с учётом DPR — для кэша спрайтов. */
export function makeCanvas(width: number, height: number, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  return canvas;
}
