import type { Lang } from '@/i18n';
import { isPermanent } from '@/store/catalog';
import type { Payments, Platform, PurchaseResult } from './types';

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
  getPayments?(opts?: { signed: boolean }): Promise<YPayments>;
  getPlayer(opts?: { scopes: boolean }): Promise<{ getData(keys?: string[]): Promise<Record<string, unknown>>; setData(data: Record<string, unknown>, flush?: boolean): Promise<void> }>;
  on?(event: 'game_api_pause' | 'game_api_resume', fn: () => void): void;
}

interface YPayments {
  getCatalog(): Promise<{ id: string; price: string }[]>;
  getPurchases(): Promise<{ productID: string; purchaseToken: string }[]>;
  purchase(opts: { id: string }): Promise<{ productID: string; purchaseToken: string }>;
  consumePurchase(token: string): Promise<void>;
}

/**
 * Покупки Яндекс Игр. Товары заводятся в консоли с теми же id, что в каталоге игры.
 * Навсегда купленное не «потребляется» и приходит в getPurchases при каждом входе;
 * чаевые и прочие разовые — потребляются сразу (требование площадки).
 */
class YandexPayments implements Payments {
  constructor(private readonly api: YPayments) {}

  async prices(): Promise<Record<string, string>> {
    const list = await this.api.getCatalog().catch(() => []);
    return Object.fromEntries(list.map((p) => [p.id, p.price]));
  }

  async owned(): Promise<string[] | null> {
    const list = await this.api.getPurchases().catch(() => null);
    if (!list) return null;
    for (const p of list) if (!isPermanent(p.productID)) void this.api.consumePurchase(p.purchaseToken).catch(() => undefined);
    return list.map((p) => p.productID).filter(isPermanent);
  }

  async buy(productId: string): Promise<PurchaseResult> {
    try {
      const p = await this.api.purchase({ id: productId });
      if (!isPermanent(p.productID)) await this.api.consumePurchase(p.purchaseToken).catch(() => undefined);
      return 'paid';
    } catch (e) {
      // Игрок закрыл окно оплаты — SDK отклоняет промис; отличить отмену от сбоя надёжно нельзя
      return String((e as { message?: string })?.message ?? e).toLowerCase().includes('cancel') ? 'cancelled' : 'failed';
    }
  }
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
  payments: Payments | null = null;
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
      const payments = await this.sdk?.getPayments?.({ signed: false }).catch(() => null);
      if (payments) this.payments = new YandexPayments(payments);
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
