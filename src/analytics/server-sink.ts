import { getLang } from '@/i18n';
import type { AnalyticsSink } from './index';

type Params = Record<string, string | number | boolean>;

export const CLIENT_KEY = 'starweave.client.v1';
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
 * Свой сервер аналитики (`server/`): события копятся пачкой и уходят раз в несколько
 * секунд и при сворачивании игры. Тело — text/plain с JSON: так браузеру не нужен
 * предварительный запрос, а `keepalive` доносит последнюю пачку даже при закрытии.
 */
export class ServerSink implements AnalyticsSink {
  private readonly client = clientId();
  private readonly session = crypto.randomUUID();
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
      if (document.visibilityState === 'hidden') flushNow();
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
    const body = JSON.stringify({ c: this.client, s: this.session, p: this.platform, v: this.version, l: getLang(), n: Date.now(), e: events });
    void fetch(this.url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit' }).catch(() => undefined);
    if (this.queue.length) this.flush();
  }
}
