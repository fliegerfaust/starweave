/**
 * Защита от заливки событиями (SEC.1). Диск VPS общий с платформой, поэтому поток событий
 * держат четыре предела:
 *  - ведро на адрес: IPv6 считается по подсети /64 — её целиком выдают одному абоненту,
 *    и перебор адресов внутри неё не даёт новых вёдер;
 *  - общее ведро процесса: сколько бы адресов ни было, пачек в секунду не больше потолка;
 *  - дневная квота на `client` игры;
 *  - потолок размера базы: события перестают приниматься раньше, чем кончится место
 *    под покупки (`events.db` одна на всё).
 * Таблицы вёдер и квот ограничены по размеру: ротация адресов не раздувает память.
 */

/** Ключ ведра: IPv4 как есть, IPv6 — первые 64 бита. */
export function clientKey(ip: string): string {
  const addr = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) return mapped[1]!;
  if (!addr.includes(':')) return addr;
  const groups = expandIPv6(addr);
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : addr;
}

/** Восемь групп IPv6 без сокращений, или null, если это не адрес. */
function expandIPv6(addr: string): string[] | null {
  const parts = addr.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  // Хвост вида ::1.2.3.4 — последние 32 бита записаны как IPv4
  const last = tail.length ? tail[tail.length - 1]! : head[head.length - 1];
  if (last && last.includes('.')) return null;
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => g.replace(/^0+(?=.)/, ''));
}

interface Bucket {
  tokens: number;
  at: number;
}

/** Ведро токенов на ключ: `rate` в секунду, запас `burst`, не больше `maxKeys` ключей. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly rate: number;
  private readonly burst: number;
  private readonly maxKeys: number;
  private readonly idleMs: number;

  constructor(rate: number, burst: number, maxKeys = 50_000, idleMs = 10 * 60 * 1000) {
    this.rate = rate;
    this.burst = burst;
    this.maxKeys = maxKeys;
    this.idleMs = idleMs;
  }

  allow(key: string, now: number): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      // Таблица полна и после чистки — новых адресов не заводим, пока не освободится место
      if (this.buckets.size >= this.maxKeys) return false;
      b = { tokens: this.burst, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Забывает вёдра, которые давно полные: их владелец спокоен. */
  sweep(now: number): void {
    for (const [key, b] of this.buckets) if (now - b.at > this.idleMs) this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }
}

/** Сколько пачек за сутки (UTC) принимается от одного `client` игры. */
export class DailyQuota {
  private day = -1;
  private readonly used = new Map<string, number>();
  private readonly perDay: number;
  private readonly maxKeys: number;

  constructor(perDay: number, maxKeys = 200_000) {
    this.perDay = perDay;
    this.maxKeys = maxKeys;
  }

  take(key: string, now: number): boolean {
    const day = Math.floor(now / 86_400_000);
    if (day !== this.day) {
      this.day = day;
      this.used.clear();
    }
    const n = this.used.get(key) ?? 0;
    if (n >= this.perDay) return false;
    if (n === 0 && this.used.size >= this.maxKeys) return false;
    this.used.set(key, n + 1);
    return true;
  }
}

/** Пределы `/v1/events`, собранные вместе. */
export interface EventLimits {
  perIp: RateLimiter;
  global: RateLimiter;
  quota: DailyQuota;
}

export function eventLimits(): EventLimits {
  return {
    // Игра шлёт пачку раз в несколько секунд; 1 в секунду с запасом 30 — щедро
    perIp: new RateLimiter(1, 30),
    // Весь сервер: 20 пачек в секунду — это тысячи одновременных игроков
    global: new RateLimiter(20, 200, 1),
    // Сутки активной игры — сотни пачек; 2000 — с большим запасом
    quota: new DailyQuota(2000),
  };
}

export type Verdict = 'ok' | 'ip' | 'global';

/** Первые два предела — до чтения тела; квота — после, когда известен `client`. */
export function admit(limits: EventLimits, ip: string, now: number): Verdict {
  if (!limits.perIp.allow(clientKey(ip), now)) return 'ip';
  if (!limits.global.allow('all', now)) return 'global';
  return 'ok';
}

/** Потолок размера базы для событий (байты); покупкам место остаётся всегда. */
export const DEFAULT_EVENTS_DB_MAX = 1024 * 1024 * 1024;
