/**
 * Холсты переживают сворачивание игры (BG.1, отзыв Андрея 28.10).
 *
 * Медальоны Знамений, лица карт, значки Затмений рисуются на холстах один раз и дальше только
 * копируются. Chrome на Android, пока вкладка в фоне, может выбросить буферы холстов: вернулся
 * в игру — на месте Знамений пустые круги, карта в руке — пустой прямоугольник. Браузер сообщает
 * об этом событиями `contextlost` / `contextrestored`, но не везде, поэтому есть ещё «канарейка»:
 * залитый холст, который проверяется при возврате из фона.
 *
 * Холст, который надо уметь восстановить, регистрируется вместе с функцией, рисующей его с нуля
 * (`keepPainted`). После потери все живые холсты перерисовываются на месте: те же элементы,
 * экраны не перестраиваются, прокрутка и открытые окна остаются.
 */

export type Paint = (canvas: HTMLCanvasElement) => void;

const paints = new WeakMap<HTMLCanvasElement, Paint>();
let live = new Set<WeakRef<HTMLCanvasElement>>();
let sinceSweep = 0;
let lost = false;
let scheduled = false;
let canary: HTMLCanvasElement | null = null;
let cause: 'event' | 'canary' = 'event';
let report: ((canvases: number, by: 'event' | 'canary') => void) | null = null;
const listeners: (() => void)[] = [];

// Без preventDefault браузер сам вернёт контекст и пришлёт `contextrestored`
const onLost = () => {
  lost = true;
};
const onRestored = () => schedule();

/** Сбросить буфер и состояние контекста и нарисовать заново. */
function redraw(canvas: HTMLCanvasElement, paint: Paint): void {
  if (!canvas.width || !canvas.height) return;
  // Присваивание размера очищает буфер и сбрасывает трансформацию, тени, прозрачность
  canvas.width = canvas.width;
  try {
    paint(canvas);
  } catch {
    // Холст, который не удалось перерисовать, лучше оставить пустым, чем уронить игру
  }
}

/**
 * Запомнить, как нарисовать холст с нуля. `paint` получает чистый холст того же размера
 * (трансформация сброшена) и рисует его целиком. Возвращает тот же холст.
 */
export function keepPainted<T extends HTMLCanvasElement>(canvas: T, paint: Paint): T {
  paints.set(canvas, paint);
  live.add(new WeakRef(canvas));
  canvas.addEventListener('contextlost', onLost);
  canvas.addEventListener('contextrestored', onRestored);
  if (++sinceSweep > 400) sweep();
  return canvas;
}

/** Как нарисован холст — чтобы его копия умела нарисоваться сама, без исходника. */
export function paintOf(canvas: HTMLCanvasElement): Paint | undefined {
  return paints.get(canvas);
}

/** Холст больше не нужен (вытеснен из кэша): не перерисовывать. */
export function forget(canvas: HTMLCanvasElement): void {
  paints.delete(canvas);
}

/** Что ещё перерисовать после восстановления (основной холст, сцены со своим кадром). */
export function onCanvasRestore(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function sweep(): void {
  sinceSweep = 0;
  const next = new Set<WeakRef<HTMLCanvasElement>>();
  for (const ref of live) {
    const c = ref.deref();
    if (c && paints.has(c)) next.add(ref);
  }
  live = next;
}

/** Перерисовать все живые холсты (в порядке создания: исходники раньше копий). */
export function repaintAll(): void {
  lost = false;
  sweep();
  let n = 0;
  for (const ref of live) {
    const c = ref.deref();
    const paint = c && paints.get(c);
    if (c && paint) {
      redraw(c, paint);
      n++;
    }
  }
  report?.(n, cause);
  cause = 'event';
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      // перерисовка одной сцены не должна мешать остальным
    }
  }
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // Один проход на пачку событий: контексты возвращаются не все сразу
  requestAnimationFrame(() => {
    scheduled = false;
    repaintAll();
  });
}

function paintCanary(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
}

/** Канарейка пуста — буферы холстов выброшены, даже если браузер промолчал. */
function canaryDied(): boolean {
  if (!canary) return false;
  const ctx = canary.getContext('2d');
  if (!ctx) return false;
  if ((ctx as CanvasRenderingContext2D & { isContextLost?: () => boolean }).isContextLost?.()) return true;
  try {
    return ctx.getImageData(canary.width >> 1, canary.height >> 1, 1, 1).data[3] === 0;
  } catch {
    return false;
  }
}

function check(): void {
  if (lost) schedule();
  else if (canaryDied()) {
    cause = 'canary';
    schedule();
  }
}

let started = false;

/** Слушать возврат из фона. Вызывается один раз при запуске игры; `onRepaint` — для аналитики. */
export function watchCanvasLife(onRepaint?: (canvases: number, by: 'event' | 'canary') => void): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  report = onRepaint ?? null;
  // Размер как у крупного спрайта: мелкие холсты браузер держит в памяти и не выбрасывает
  canary = document.createElement('canvas');
  canary.width = canary.height = 256;
  keepPainted(canary, paintCanary);
  paintCanary(canary);
  const resume = () => {
    if (document.visibilityState !== 'visible') return;
    check();
    // Контексты возвращаются не мгновенно: проверить ещё раз чуть позже
    setTimeout(check, 600);
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
}

/**
 * Для проверок: выбросить буферы всех холстов, как это делает браузер в фоне. `silent` —
 * без событий, как браузер, который о потере молчит (тогда её замечает канарейка).
 */
export function simulateCanvasLoss(silent = false): number {
  let n = 0;
  for (const ref of live) {
    const c = ref.deref();
    if (!c || !c.width) continue;
    c.width = c.width;
    if (!silent) c.dispatchEvent(new Event('contextlost'));
    n++;
  }
  return n;
}
