import type { Lang } from '@/i18n';
import { FakePayments } from '@/store/fake-payments';
import type { Payments, Platform } from './types';

/**
 * Обычный веб и PWA: ни рекламы, ни покупок. Для проверки интерфейса в разработке можно
 * включить имитацию рекламы (`?fakeads`) и покупок (`?fakepay`).
 */
export class WebPlatform implements Platform {
  readonly id = 'web' as const;
  readonly rewardedAvailable: boolean;
  readonly payments: Payments | null;
  private pauseListeners: ((paused: boolean) => void)[] = [];

  constructor() {
    const params = new URLSearchParams(location.search);
    this.rewardedAvailable = import.meta.env.DEV && params.has('fakeads');
    this.payments = import.meta.env.DEV && params.has('fakepay') ? new FakePayments() : null;
  }

  async init(): Promise<void> {}

  /** Ссылка на сайт вида `?startapp=c_…` — тот же формат, что и в Telegram. */
  startParam(): string | null {
    return new URLSearchParams(location.search).get('startapp');
  }
  ready(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<void> {
    if (this.rewardedAvailable) await this.fakeAd(1200);
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedAvailable) return false;
    await this.fakeAd(1500);
    return true;
  }

  language(): Lang | null {
    return null;
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    return null;
  }

  async cloudSave(): Promise<void> {}

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseListeners.push(fn);
  }

  /** Имитация рекламного ролика для разработки. */
  private fakeAd(ms: number): Promise<void> {
    for (const fn of this.pauseListeners) fn(true);
    const el = document.createElement('div');
    el.textContent = 'Реклама (тест)';
    el.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:#000;color:#fff;font:700 24px sans-serif';
    document.body.append(el);
    return new Promise((resolve) =>
      setTimeout(() => {
        el.remove();
        for (const fn of this.pauseListeners) fn(false);
        resolve();
      }, ms),
    );
  }
}
