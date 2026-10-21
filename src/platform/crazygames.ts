import type { Lang } from '@/i18n';
import type { Platform } from './types';

type AdType = 'midgame' | 'rewarded';

/** Часть SDK CrazyGames v3, которой мы пользуемся. */
export interface CGSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    inviteLink(params: Record<string, string>): string;
    getInviteParam(name: string): string | null;
    settings: { muteAudio: boolean };
    addSettingsChangeListener(fn: (settings: { muteAudio: boolean }) => void): void;
  };
  ad: {
    requestAd(type: AdType, callbacks: { adStarted?(): void; adFinished?(): void; adError?(error: { code?: string }): void }): void;
  };
  user: { systemInfo: { locale: string } };
  data: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CGSDK };
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
/** Все сохранения игры — одной записью Data module (лимит 1 МБ, у нас десятки КБ). */
export const SAVE_KEY = 'starweave';

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
 * CrazyGames. Требования площадки, которые закрывает адаптер: `loadingStart/Stop`,
 * `gameplayStart/Stop`, реклама только через SDK с паузой и без звука, звук по настройке
 * сайта, язык из `systemInfo.locale`, сохранения через Data module, вызов друга ссылкой
 * на страницу игры. Своих покупок нет (правила площадки), атлас открыт бесплатно.
 *
 * На Basic Launch рекламы нет — сборка без `VITE_CG_ADS=1` её не просит, кнопок рекламы
 * не видно. Если SDK всё же ответит `adsDisabledBasicLaunch`, реклама выключается до перезапуска.
 */
export class CrazyGamesPlatform implements Platform {
  readonly id = 'crazygames' as const;
  rewardedAvailable = false;
  interstitialAvailable = false;
  readonly payments = null;
  /** Атлас и внешний вид бесплатно: покупок на площадке нет. Набор мецената — тоже нет. */
  readonly grants = ['atlas', 'back_comet', 'back_aurora', 'sky_aurora', 'sky_ember'] as const;
  private sdk: CGSDK | null = null;
  private pauseListeners: ((paused: boolean) => void)[] = [];
  private muteListeners: ((muted: boolean) => void)[] = [];
  private playing = false;

  constructor(private readonly adsEnabled = import.meta.env.VITE_CG_ADS === '1') {}

  async init(): Promise<void> {
    try {
      // Сеть не отдала SDK — игра не должна висеть на заставке: через 10 с запускаемся как веб
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SDK timeout')), 10_000));
      if (!window.CrazyGames) await Promise.race([loadScript(SDK_URL), timeout]);
      const sdk = window.CrazyGames?.SDK ?? null;
      await Promise.race([sdk?.init(), timeout]);
      // Вне портала SDK отвечает `disabled` — работаем как обычный веб
      this.sdk = sdk && sdk.environment !== 'disabled' ? sdk : null;
    } catch {
      this.sdk = null;
    }
    const sdk = this.sdk;
    if (!sdk) return;
    sdk.game.loadingStart();
    this.rewardedAvailable = this.adsEnabled;
    this.interstitialAvailable = this.adsEnabled;
    sdk.game.addSettingsChangeListener((s) => this.emitMute(s.muteAudio));
  }

  ready(): void {
    const sdk = this.sdk;
    if (!sdk) return;
    sdk.game.loadingStop();
    // Звук сайт мог выключить ещё до загрузки игры
    if (sdk.game.settings.muteAudio) this.emitMute(true);
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.sdk?.game.gameplayStart();
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.sdk?.game.gameplayStop();
  }

  /** Победа над последним Затмением — «счастливый момент» для площадки. */
  happytime(): void {
    this.sdk?.game.happytime();
  }

  async showInterstitial(): Promise<void> {
    if (this.interstitialAvailable) await this.ad('midgame');
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedAvailable) return false;
    return this.ad('rewarded');
  }

  /** Ролик: на время показа игра на паузе и без звука; награда — только за досмотренный. */
  private ad(type: AdType): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    // Сайт сам решает, показывать ли ролик (не чаще раза в 3 минуты): если не покажет,
    // ответит adError — игра продолжает без паузы
    const wasPlaying = this.playing;
    return new Promise((resolve) => {
      let started = false;
      const done = (ok: boolean) => {
        if (started) this.emitPause(false);
        if (started && wasPlaying) this.gameplayStart();
        resolve(ok);
      };
      sdk.ad.requestAd(type, {
        adStarted: () => {
          started = true;
          this.gameplayStop();
          this.emitPause(true);
        },
        adFinished: () => done(true),
        adError: (error) => {
          if (error?.code === 'adsDisabledBasicLaunch') {
            this.rewardedAvailable = false;
            this.interstitialAvailable = false;
          }
          done(false);
        },
      });
    });
  }

  language(): Lang | null {
    const locale = this.sdk?.user.systemInfo.locale;
    if (!locale) return null;
    const lang = locale.toLowerCase().split(/[-_]/)[0]!;
    return ['ru', 'be', 'kk', 'uk', 'uz'].includes(lang) ? 'ru' : 'en';
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    const raw = this.sdk?.data.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as unknown;
      return data && typeof data === 'object' ? (data as Record<string, string>) : null;
    } catch {
      return null;
    }
  }

  async cloudSave(data: Record<string, string>): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) return;
    if (Object.keys(data).length) sdk.data.setItem(SAVE_KEY, JSON.stringify(data));
    else sdk.data.removeItem(SAVE_KEY);
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseListeners.push(fn);
  }

  onMuteChange(fn: (muted: boolean) => void): void {
    this.muteListeners.push(fn);
  }

  /** Вызов друга — ссылка на страницу игры на CrazyGames, не на свой сайт (запрет кросс-промо). */
  inviteUrl(startParam: string): string | null {
    return this.sdk?.game.inviteLink({ startapp: startParam }) ?? null;
  }

  startParam(): string | null {
    return this.sdk?.game.getInviteParam('startapp') ?? null;
  }

  private emitPause(paused: boolean): void {
    for (const fn of this.pauseListeners) fn(paused);
  }

  private emitMute(muted: boolean): void {
    for (const fn of this.muteListeners) fn(muted);
  }
}
