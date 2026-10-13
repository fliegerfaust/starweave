import type { Payments, PurchaseResult } from '@/platform/types';
import { productsFor } from './catalog';

/** Адрес своего сервера: явный или тот же, куда идут события. */
export function apiBase(): string | null {
  const explicit = import.meta.env.VITE_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const events = import.meta.env.VITE_EVENTS_URL;
  if (!events) return null;
  try {
    return new URL(events).origin;
  } catch {
    return null;
  }
}

type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

export interface StarsHost {
  /** Подписанные Telegram данные запуска — сервер по ним узнаёт игрока. */
  initData: string;
  openInvoice(url: string, cb: (status: InvoiceStatus) => void): void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Покупки за Telegram Stars. Счёт выставляет наш сервер (у него токен бота), игра
 * открывает его окном Telegram. Оплату подтверждает сервер по уведомлению бота —
 * список купленного всегда берётся с сервера.
 */
export class StarsPayments implements Payments {
  constructor(
    private readonly host: StarsHost,
    private readonly base: string,
  ) {}

  /** Цены — только если сервер принимает оплату (без токена бота он отвечает 503). */
  async prices(): Promise<Record<string, string>> {
    const res = await this.post('/v1/pay/owned', {});
    if (!res?.ok) return {};
    return Object.fromEntries(productsFor('telegram').map((p) => [p.id, `${p.stars} ⭐`]));
  }

  async owned(): Promise<string[] | null> {
    const res = await this.post('/v1/pay/owned', {});
    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as { owned?: unknown } | null;
    return Array.isArray(data?.owned) ? data.owned.filter((x): x is string => typeof x === 'string') : null;
  }

  async buy(productId: string): Promise<PurchaseResult> {
    const res = await this.post('/v1/pay/invoice', { product: productId });
    if (!res?.ok) return 'failed';
    const data = (await res.json().catch(() => null)) as { link?: unknown } | null;
    if (typeof data?.link !== 'string') return 'failed';
    const status = await new Promise<InvoiceStatus>((resolve) => this.host.openInvoice(data.link as string, resolve));
    if (status === 'cancelled') return 'cancelled';
    if (status === 'failed') return 'failed';
    // Telegram сказал «оплачено» (или «в обработке») — ждём, пока бот получит подтверждение
    for (let i = 0; i < 8; i++) {
      const owned = await this.owned();
      if (owned?.includes(productId)) return 'paid';
      await wait(1000 + i * 500);
    }
    // Чаевые в списке купленного не появляются; навсегда купленное подтянется при следующем входе
    return status === 'paid' ? 'paid' : 'failed';
  }

  private post(path: string, body: Record<string, unknown>): Promise<Response | null> {
    // text/plain — простой запрос, браузер не шлёт предварительный OPTIONS
    return fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ...body, initData: this.host.initData }),
      credentials: 'omit',
    }).catch(() => null);
  }
}
