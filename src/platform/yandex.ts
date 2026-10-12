import type { Lang } from '@/i18n';
import type { Platform } from './types';

/** Часть SDK Яндекс Игр, которой мы пользуемся. */
interface YSDK {
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(opts: { callbacks: { onOpen?(): void; onClose?(wasShown: boolean): void; onError?(e: unknown): void } }): void;
    showRewardedVideo(opts: { callbacks: { onOpen?(): void; onRewarded?(): void; onClose?(): void; onError?(e: unknown): void } }): void;
  };
  environment: { i18n: { lang: string } };
  getPlayer(opts?: { scopes: boolean }): Promise<{ getData(keys?: string[]): Promise<Record<string, unknown>>; setData(data: Record<string, unknown>, flush?: boolean): Promise<void> }>;
  on?(event: 'game_api_pause' | 'game_api_resume', fn: () => void): void;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YSDK> };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Не загрузился ${src}`));
    document.head.append(s);
  });
}

/**
 * Яндекс Игры. Требования площадки, которые закрывает адаптер: `LoadingAPI.ready`,
 * `GameplayAPI.start/stop`, реклама только через SDK и с паузой звука, язык из SDK,
 * облачные сохранения игрока.
 */
export class YandexPlatform implements Platform {
  readonly id = 'yandex' as const;
  rewardedAvailable = false;
  private sdk: YSDK | null = null;
  private player: Awaited<ReturnType<YSDK['getPlayer']>> | null = null;
  private pauseListeners: ((paused: boolean) => void)[] = [];
  private playing = false;

  async init(): Promise<void> {
    try {
      if (!window.YaGames) await loadScript('/sdk.js');
      this.sdk = (await window.YaGames?.init()) ?? null;
      this.rewardedAvailable = !!this.sdk;
      this.sdk?.on?.('game_api_pause', () => this.emitPause(true));
      this.sdk?.on?.('game_api_resume', () => this.emitPause(false));
      this.player = (await this.sdk?.getPlayer({ scopes: false }).catch(() => null)) ?? null;
    } catch {
      // Вне Яндекса (локальная проверка сборки) — работаем как обычный веб
      this.sdk = null;
    }
  }

  ready(): void {
    this.sdk?.features.LoadingAPI?.ready();
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.sdk?.features.GameplayAPI?.start();
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.sdk?.features.GameplayAPI?.stop();
  }

  showInterstitial(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve();
    return new Promise((resolve) => {
      sdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => this.emitPause(true),
          onClose: () => {
            this.emitPause(false);
            resolve();
          },
          onError: () => {
            this.emitPause(false);
            resolve();
          },
        },
      });
    });
  }

  showRewarded(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    return new Promise((resolve) => {
      let rewarded = false;
      sdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => this.emitPause(true),
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            this.emitPause(false);
            resolve(rewarded);
          },
          onError: () => {
            this.emitPause(false);
            resolve(false);
          },
        },
      });
    });
  }

  language(): Lang | null {
    const lang = this.sdk?.environment.i18n.lang;
    if (!lang) return null;
    return ['ru', 'be', 'kk', 'uk', 'uz'].includes(lang) ? 'ru' : 'en';
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    if (!this.player) return null;
    const data = await this.player.getData().catch(() => null);
    return (data as Record<string, string> | null) ?? null;
  }

  async cloudSave(data: Record<string, string>): Promise<void> {
    await this.player?.setData(data).catch(() => undefined);
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseListeners.push(fn);
  }

  private emitPause(paused: boolean): void {
    for (const fn of this.pauseListeners) fn(paused);
  }
}
