/**
 * Проверка пачки событий от игры. Сервер открыт в интернет, поэтому всё, что пришло,
 * считается недоверенным: строгие форматы, лимиты на размеры, только простые значения.
 * Личных данных игра не шлёт — только случайный идентификатор устройства.
 */

export type Value = string | number | boolean;

export interface IncomingEvent {
  name: string;
  params: Record<string, Value>;
  /** Время события на сервере (мс), пересчитанное из часов клиента. */
  at: number;
}

export interface Batch {
  client: string;
  session: string;
  platform: string;
  version: string;
  lang: string;
  events: IncomingEvent[];
  /** Тестовая пачка (`t: 1` — dev, сборка `--test`, «тестер»): хранится для отладки, в сводку не идёт (SA.1). */
  test?: boolean;
  /** Что выкинуто из пачки, а не уронило её (SA.8): причины по одной на событие или параметр. */
  dropped?: string[];
}

/**
 * Отказы с момента старта (SA.8): причина → сколько раз. Пачка целиком — `batch: …`, выкинутое
 * событие или параметр — `event: …` / `param: …`. Показываются в «Здоровье» сводки.
 */
export const rejects = new Map<string, number>();
export function countReject(reason: string, n = 1): void {
  rejects.set(reason, (rejects.get(reason) ?? 0) + n);
}

export const LIMITS = {
  body: 32 * 1024,
  events: 50,
  params: 24,
  string: 200,
  /** Стек ошибки (js_error.stack) — единственная длинная строка. */
  stack: 1000,
  /** Насколько назад можно датировать событие (очередь офлайн-устройства). */
  backdateMs: 24 * 60 * 60 * 1000,
} as const;

const PLATFORMS = new Set(['web', 'yandex', 'telegram', 'pikabu']);
const ID = /^[a-z0-9-]{8,64}$/;
const NAME = /^[a-z][a-z0-9_]{1,40}$/;
const KEY = /^[a-z][a-z0-9_]{0,30}$/;
const VERSION = /^[0-9a-z.+-]{1,20}$/;

/**
 * Разбирает тело запроса. Формат (короткие ключи — меньше трафика с телефона):
 * `{ c: клиент, s: сессия, p: площадка, v: версия, l: язык, n: время отправки по часам
 * клиента, e: [[имя, параметры, время события по часам клиента], …] }`.
 * Возвращает пачку или строку с причиной отказа.
 */
export function parseBatch(raw: string, serverNow: number): Batch | string {
  if (raw.length > LIMITS.body) return 'body too large';
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return 'bad json';
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'bad body';
  const b = body as Record<string, unknown>;
  const client = str(b.c);
  const session = str(b.s);
  const platform = str(b.p);
  const version = str(b.v);
  const lang = str(b.l);
  const sentAt = typeof b.n === 'number' && Number.isFinite(b.n) ? b.n : null;
  if (!client || !ID.test(client)) return 'bad client';
  if (!session || !ID.test(session)) return 'bad session';
  if (!platform || !PLATFORMS.has(platform)) return 'bad platform';
  if (!version || !VERSION.test(version)) return 'bad version';
  if (lang !== 'ru' && lang !== 'en') return 'bad lang';
  if (sentAt === null) return 'bad time';
  if (!Array.isArray(b.e) || b.e.length === 0) return 'no events';
  if (b.e.length > LIMITS.events) return 'too many events';
  if (b.t !== undefined && b.t !== 0 && b.t !== 1) return 'bad test flag';

  // Плохое событие или параметр выкидываем, а не роняем всю пачку (SA.8): одно Infinity в
  // ratio раньше теряло до 40 событий соседей по пачке
  const events: IncomingEvent[] = [];
  const dropped: string[] = [];
  for (const item of b.e) {
    if (!Array.isArray(item) || item.length !== 3) {
      dropped.push('event: bad event');
      continue;
    }
    const [name, params, t] = item as unknown[];
    if (typeof name !== 'string' || !NAME.test(name)) {
      dropped.push('event: bad event name');
      continue;
    }
    if (typeof t !== 'number' || !Number.isFinite(t)) {
      dropped.push('event: bad event time');
      continue;
    }
    const clean = cleanParams(params, dropped);
    if (clean === null) {
      dropped.push('event: bad params');
      continue;
    }
    // Часы телефона могут врать: берём возраст события по его же часам и откладываем
    // от времени сервера. Будущее и слишком старое прижимаем к границам.
    const age = Math.min(LIMITS.backdateMs, Math.max(0, sentAt - t));
    events.push({ name, params: clean, at: serverNow - age });
  }
  if (events.length === 0) return 'no valid events';
  return { client, session, platform, version, lang, events, test: b.t === 1, dropped };
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Параметры события; плохой параметр выкидывается с причиной в `dropped`. null — параметров нет вовсе. */
function cleanParams(params: unknown, dropped: string[]): Record<string, Value> | null {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return null;
  const entries = Object.entries(params as Record<string, unknown>);
  if (entries.length > LIMITS.params) return null;
  const out: Record<string, Value> = {};
  for (const [key, value] of entries) {
    if (!KEY.test(key)) dropped.push('param: bad key');
    else if (typeof value === 'string') out[key] = value.slice(0, key === 'stack' ? LIMITS.stack : LIMITS.string);
    // null — так JSON передаёт Infinity и NaN (ratio при цели 0)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else dropped.push(value === null ? 'param: null' : `param: bad ${typeof value}`);
  }
  return out;
}
