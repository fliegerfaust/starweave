/** Обёртка над Canvas2D: размер в CSS-пикселях, чёткость на ретине, тряска камеры. */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  /** Потолок DPR: начинаем с полной чёткости (3× у iPhone), снижаем, если кадры не успевают. */
  private maxDpr = 3;
  private slowFrames = 0;
  /** false — всегда полная чёткость, без автоснижения (настройка «Чёткость: максимум»). */
  adaptive = true;
  private sampled = 0;
  private resizeListeners: (() => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D недоступен');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  /** Подписка на смену размера; возвращает отписку. */
  onResize(fn: () => void): () => void {
    this.resizeListeners.push(fn);
    return () => {
      this.resizeListeners = this.resizeListeners.filter((l) => l !== fn);
    };
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    // Видимая область, а не макет: в мобильных браузерах панели адреса и вкладок
    // перекрывают низ страницы, и innerHeight бывает больше того, что видно.
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(Math.min(window.innerHeight, vv?.height ?? Infinity));
    document.documentElement.style.setProperty('--app-h', `${h}px`);
    // iOS иногда прокручивает документ при повороте или открытии клавиатуры — возвращаем.
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    if (w === this.width && h === this.height && this.canvas.width === Math.round(w * this.dpr)) return;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    for (const fn of this.resizeListeners) fn();
  }

  /**
   * Учёт того, сколько времени заняла отрисовка кадра (в секундах). Меряем именно работу,
   * а не интервал между кадрами: iOS в режиме энергосбережения сам ограничивает игру 30 FPS,
   * и по интервалу это выглядело как «не тянет» — чёткость падала зря. Если сам кадр
   * стабильно дольше ~16 мс, снижаем потолок DPR на ступень: 3 → 2 → 1.5. Обратно не
   * поднимаем — лучше ровная картинка, чем мигание чёткости.
   */
  observeFrame(cost: number): void {
    if (!this.adaptive || cost > 0.25 || this.maxDpr <= 1.5) return; // вкладка была в фоне или ниже некуда
    if (++this.sampled < 90) return; // первые кадры — загрузка, не показатель
    this.slowFrames = cost > 0.016 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 90 || this.dpr < this.maxDpr) return;
    this.maxDpr = this.maxDpr > 2 ? 2 : 1.5;
    this.slowFrames = 0;
    this.sampled = 0;
    this.resize();
  }

  /** Вернуть полную чёткость (после смены настройки). */
  resetQuality(): void {
    this.maxDpr = 3;
    this.slowFrames = 0;
    this.sampled = 0;
    this.resize();
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
