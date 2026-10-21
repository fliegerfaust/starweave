import type { Payments, PurchaseResult } from '@/platform/types';
import { PRODUCTS, isPermanent } from './catalog';

const KEY = 'starweave.fakepay.v1';

/**
 * Имитация покупок для разработки (`?fakepay`): окно «оплатить / отменить», покупки
 * в localStorage. Проверяет весь путь интерфейса без площадки и сервера.
 */
export class FakePayments implements Payments {
  async prices(): Promise<Record<string, string>> {
    return Object.fromEntries(PRODUCTS.map((p) => [p.id, `${p.stars} ⭐`]));
  }

  async owned(): Promise<string[]> {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }

  async buy(productId: string): Promise<PurchaseResult> {
    const result = await this.dialog(productId);
    if (result === 'paid' && isPermanent(productId)) {
      const owned = await this.owned();
      if (!owned.includes(productId)) owned.push(productId);
      localStorage.setItem(KEY, JSON.stringify(owned));
    }
    return result;
  }

  private dialog(productId: string): Promise<PurchaseResult> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(0,0,0,.7);font:600 16px sans-serif;color:#fff';
      el.innerHTML = `<div style="background:#222;padding:20px;border-radius:12px;display:grid;gap:12px;text-align:center">Тестовая оплата: ${productId}<button data-r="paid">Оплатить</button><button data-r="cancelled">Отменить</button><button data-r="failed">Ошибка</button></div>`;
      el.addEventListener('click', (e) => {
        const r = (e.target as HTMLElement).dataset.r as PurchaseResult | undefined;
        if (!r) return;
        el.remove();
        resolve(r);
      });
      document.body.append(el);
    });
  }
}
