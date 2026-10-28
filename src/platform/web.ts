import type { Lang } from '@/i18n';
import { FakePayments } from '@/store/fake-payments';
import { FEATURES } from './features';
import type { Payments, AdOutcome, Platform } from './types';

/**
 * Обычный веб и PWA: ни рекламы, ни покупок. Для проверки интерфейса в разработке можно
 * включить имитацию рекламы (`?fakeads`) и покупок (`?fakepay`).
 */
export class WebPlatform implements Platform {
  readonly id = 'web' as const;
  readonly rewardedAvailable: boolean;
  readonly interstitialAvailable: boolean;
  readonly payments: Payments | null;
  /** Всё новое 0.7.4 включено и на сайте (решение Дениса, выпуск 0.7.8). */
  readonly features = FEATURES;
  private pauseListeners: ((paused: boolean) => void)[] = [];

  constructor() {
    const params = new URLSearchParams(location.search);
    this.rewardedAvailable = import.meta.env.DEV && params.has('fakeads');
    this.interstitialAvailable = this.rewardedAvailable;
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

  async showInterstitial(): Promise<AdOutcome> {
    if (!this.rewardedAvailable) return { result: 'nofill' };
    await this.fakeAd(1200);
    return { result: 'shown' };
  }

  async showRewarded(): Promise<AdOutcome> {
    if (!this.rewardedAvailable) return { result: 'nofill' };
    await this.fakeAd(1500);
    return { result: 'rewarded' };
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
