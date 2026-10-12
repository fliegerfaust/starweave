import type { Lang } from '@/i18n';
import type { Platform } from './types';

/**
 * Обычный веб и PWA: рекламы нет. Для проверки интерфейса в разработке можно
 * включить имитацию рекламы параметром `?fakeads`.
 */
export class WebPlatform implements Platform {
  readonly id = 'web' as const;
  readonly rewardedAvailable: boolean;
  private pauseListeners: ((paused: boolean) => void)[] = [];

  constructor() {
    this.rewardedAvailable = import.meta.env.DEV && new URLSearchParams(location.search).has('fakeads');
  }

  async init(): Promise<void> {}
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
