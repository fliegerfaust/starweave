import { getLang } from '@/i18n';
import type { AnalyticsSink } from './index';

type Params = Record<string, string | number | boolean>;

export const CLIENT_KEY = 'starweave.client.v1';
/** Своё устройство Дениса (`?tester` в адресе, `?tester=0` — снять): его события сводка не считает. */
export const TESTER_KEY = 'starweave.tester';
const FLUSH_MS = 5000;
const MAX_BATCH = 40;

/** Случайный номер устройства: без него не посчитать «вернулся ли игрок». Личного ничего. */
function clientId(): string {
  try {
    const saved = localStorage.getItem(CLIENT_KEY);
    if (saved && /^[a-z0-9-]{8,64}$/.test(saved)) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID(); // приватный режим — считаем как новое устройство
  }
}

/** «Сбросить прогресс» забывает и номер устройства: новая статистика с прошлой не свяжется. */
export function forgetClientId(): void {
  try {
    localStorage.removeItem(CLIENT_KEY);
  } catch {
    /* приватный режим */
  }
}

/**
 * Тестовый трафик (SA.1): разработка, тестовое окружение Пикабу (`/pikabu-test/`) и устройство,
 * помеченное `?tester`. Пачка уходит с `t: 1` — сервер её хранит, но в сводку не берёт.
 */
export function isTestTraffic(): boolean {
  if (import.meta.env.DEV || location.pathname.includes('-test/')) return true;
  try {
    const flag = new URLSearchParams(location.search).get('tester');
    if (flag === '0') localStorage.removeItem(TESTER_KEY);
    else if (flag !== null) localStorage.setItem(TESTER_KEY, '1');
    return localStorage.getItem(TESTER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Свой сервер аналитики (`server/`): события копятся пачкой и уходят раз в несколько
 * секунд и при сворачивании игры. Тело — text/plain с JSON: так браузеру не нужен
 * предварительный запрос, а `keepalive` доносит последнюю пачку даже при закрытии.
 */
export class ServerSink implements AnalyticsSink {
  private readonly client = clientId();
  private readonly session = crypto.randomUUID();
  private readonly test = isTestTraffic();
  /** С какого момента игра на экране — для `app_hide` (честная длина сессии, SA.4). */
  private shownAt = performance.now();
  private queue: [string, Params, number][] = [];
  private timer = 0;

  constructor(
    private readonly url: string,
    private readonly platform: string,
    private readonly version: string,
  ) {}

  init(): void {
    const flushNow = () => this.flush();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Сколько игра была на экране: событие уходит этой же последней пачкой
        this.send('app_hide', { ms: Math.round(performance.now() - this.shownAt) });
        flushNow();
      } else this.shownAt = performance.now();
    });
    window.addEventListener('pagehide', flushNow);
  }

  send(name: string, params: Params): void {
    this.queue.push([name, params, Date.now()]);
    if (this.queue.length >= MAX_BATCH) this.flush();
    else if (!this.timer) this.timer = window.setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, MAX_BATCH);
    const body = JSON.stringify({ c: this.client, s: this.session, p: this.platform, v: this.version, l: getLang(), n: Date.now(), e: events, ...(this.test ? { t: 1 } : {}) });
    void fetch(this.url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit' }).catch(() => undefined);
    if (this.queue.length) this.flush();
  }
}
