import { App } from '@capacitor/app';
import type { Lang } from '@/i18n';
import { bootCover, hideCover, whenSmooth } from './boot-cover';
import { FEATURES } from './features';
import type { AdOutcome, Platform } from './types';

/**
 * Сборка Android на Capacitor (`VITE_PLATFORM=android`, эпик APK). Для паблишеров: рекламы
 * и покупок нет, их SDK подключаются отдельным адаптером. Сохранения остаются на устройстве.
 */
export class AndroidPlatform implements Platform {
  readonly id = 'android' as const;
  readonly rewardedAvailable = false;
  readonly interstitialAvailable = false;
  readonly payments = null;
  readonly features = FEATURES;
  /** Ссылка из приложения вела бы на его внутренний адрес, а не на сайт. */
  readonly challenges = false;

  /** Паблишеры смотрят самую красивую версию: сторож кадров эффекты здесь не выключает. */
  readonly fixedFx = true;
  booting = true;
  private cover: HTMLElement | null = null;
  private warm: () => boolean = () => true;

  async init(): Promise<void> {
    document.documentElement.classList.add('android');
    this.cover = bootCover();
  }

  onWarm(ready: () => boolean): void {
    this.warm = ready;
  }

  ready(): void {
    whenSmooth(() => this.warm(), () => {
      this.booting = false;
      if (this.cover) hideCover(this.cover);
    });
  }
  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<AdOutcome> {
    return { result: 'nofill' };
  }

  async showRewarded(): Promise<AdOutcome> {
    return { result: 'nofill' };
  }

  language(): Lang | null {
    return null;
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    return null;
  }

  async cloudSave(): Promise<void> {}

  onPauseChange(): void {}

  onBack(fn: () => void): void {
    void App.addListener('backButton', fn);
  }

  exit(): void {
    void App.exitApp();
  }
}
