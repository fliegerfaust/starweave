import type { EventMap, EventName } from './events';

export type { EventMap, EventName } from './events';

type Params = Record<string, string | number | boolean>;

/** Куда уходят события: консоль разработчика, Метрика, позже — AppMetrica в нативной сборке. */
export interface AnalyticsSink {
  init?(): void;
  send(name: string, params: Params): void;
}

class ConsoleSink implements AnalyticsSink {
  send(name: string, params: Params): void {
    console.debug(`[analytics] ${name}`, params);
  }
}

declare global {
  interface Window {
    ym?: ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[]; l?: number };
  }
}

/**
 * Яндекс Метрика: события уходят как цели `reachGoal` с параметрами визита.
 * Номер счётчика задаётся при сборке: `VITE_METRIKA_ID=12345678`.
 */
class MetrikaSink implements AnalyticsSink {
  constructor(private readonly id: number) {}

  init(): void {
    // Официальный загрузчик Метрики, переписанный без минификации
    const queue = ((...args: unknown[]) => {
      (queue.a = queue.a ?? []).push(args);
    }) as NonNullable<Window['ym']>;
    queue.l = Date.now();
    window.ym = window.ym ?? queue;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.append(script);
    window.ym(this.id, 'init', { clickmap: false, trackLinks: false, accurateTrackBounce: true, defer: true });
  }

  send(name: string, params: Params): void {
    window.ym?.(this.id, 'reachGoal', name, params);
  }
}

let sinks: AnalyticsSink[] = [];
const queue: [string, Params][] = [];

/** Подключает приёмники событий. Без счётчика — только консоль в разработке. */
export function initAnalytics(): void {
  const id = Number(import.meta.env.VITE_METRIKA_ID ?? 0);
  sinks = [];
  if (import.meta.env.DEV) sinks.push(new ConsoleSink());
  if (id > 0) sinks.push(new MetrikaSink(id));
  for (const sink of sinks) sink.init?.();
  for (const [name, params] of queue.splice(0)) for (const sink of sinks) sink.send(name, params);
  window.addEventListener('error', (e) => track('js_error', { message: String(e.message).slice(0, 200) }));
}

/** Отправить событие. Аналитика никогда не роняет игру. */
export function track<K extends EventName>(name: K, params: EventMap[K]): void {
  const p = params as unknown as Params;
  if (sinks.length === 0) {
    if (queue.length < 100) queue.push([name, p]);
    return;
  }
  for (const sink of sinks) {
    try {
      sink.send(name, p);
    } catch {
      /* блокировщики рекламы и т.п. — не наша забота */
    }
  }
}

/** Средний FPS за несколько секунд — один раз за сессию, чтобы видеть слабые устройства. */
export function measureFps(seconds = 5): void {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < seconds * 1000) requestAnimationFrame(tick);
    else {
      track('perf', {
        fps: Math.round(frames / seconds),
        dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
  };
  requestAnimationFrame(tick);
}
