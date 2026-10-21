import type { EventMap, EventName } from './events';
import { ServerSink } from './server-sink';
import { compactStack } from './stack';
export { forgetClientId } from './server-sink';

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

/**
 * Подключает приёмники событий: свой сервер (`VITE_EVENTS_URL`), Яндекс Метрику
 * (`VITE_METRIKA_ID`), в разработке — консоль. Без настроек события никуда не уходят.
 */
export function initAnalytics(platform = 'web'): void {
  const id = Number(import.meta.env.VITE_METRIKA_ID ?? 0);
  const eventsUrl = import.meta.env.VITE_EVENTS_URL;
  sinks = [];
  if (import.meta.env.DEV) sinks.push(new ConsoleSink());
  if (id > 0) sinks.push(new MetrikaSink(id));
  if (eventsUrl) sinks.push(new ServerSink(eventsUrl, platform, __APP_VERSION__));
  for (const sink of sinks) sink.init?.();
  for (const [name, params] of queue.splice(0)) for (const sink of sinks) sink.send(name, params);
  window.addEventListener('error', (e) => {
    // Где: наш файл (путь без адреса сайта) или чужой скрипт (адрес) — строка и колонка
    const file = e.filename ? e.filename.replace(location.origin, '') : '';
    reportError(String(e.message), file ? `${file}:${e.lineno}:${e.colno}` : '', (e.error as Error | undefined)?.stack);
  });
  // Ошибка в промисе без catch: окно её не видит как 'error', а игра так же ломается
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    const err = reason instanceof Error ? reason : null;
    reportError(`Unhandled rejection: ${err ? `${err.name}: ${err.message}` : String(reason)}`, '', err?.stack);
  });
}

/** Сколько раз за сессию ошибка с этим сообщением уже ушла со стеком. */
const stackSent = new Map<string, number>();
/**
 * Стек — только у первых повторов: ошибка в обработчике движения пальца приходит сотнями
 * за секунды, и пачка со стеками не влезла бы в предел тела запроса на сервере.
 */
const STACKS_PER_MESSAGE = 3;

/** Ошибка, которую игра пережила сама (например, неизвестная фаза), — в ту же сводку `js_error`. */
export function reportError(message: string, where: string, stack?: string): void {
  const msg = message.slice(0, 200);
  const sent = stackSent.get(msg) ?? 0;
  const compact = sent < STACKS_PER_MESSAGE ? compactStack(stack, location.origin) : '';
  if (compact) stackSent.set(msg, sent + 1);
  track('js_error', { message: msg, where: where.slice(0, 160), ...(compact ? { stack: compact } : {}) });
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
