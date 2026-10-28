import type { Lang } from '@/i18n';
import { isPermanent } from '@/store/catalog';
import { FEATURES } from './features';
import { track } from '@/analytics';
import type { AdOutcome, Payments, Platform, PurchaseResult } from './types';

type PkbShow = { rendered: true; reward?: boolean } | { rendered: false; reason: string };

interface PkbAd {
  isSupported: boolean;
  canShow(): Promise<boolean>;
  show(): Promise<PkbShow>;
}

interface PkbPurchase {
  productId: string;
  purchaseId: string;
  isConsumable: boolean;
}

/** Часть SDK Пикабу Игр, которой мы пользуемся (games.pikabu.ru/sdk/docs). */
export interface PkbSDK {
  gameStarted(): void;
  player: { isAuthorized: boolean };
  ads: { preloader?: PkbAd; fullscreen: PkbAd; rewarded: PkbAd };
  store: {
    getProducts(): Promise<{ id: string; formattedPrice: string }[]>;
    getPurchases(): Promise<PkbPurchase[]>;
    purchase(opts: { productId: string }): Promise<{ success: true; purchase: PkbPurchase } | { success: false; reason: string }>;
  };
  storage: {
    getAll(): Record<string, unknown>;
    replaceAll(data: Record<string, unknown>): void;
  };
  on(event: 'storageSaveError', fn: (reason: string) => void): () => void;
}

declare global {
  interface Window {
    PkbSDK?: { init(): Promise<PkbSDK> };
  }
}

const SDK_URL = 'https://games.pikabu.ru/sdk/sdk.js';

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
 * Покупки Пикабу Игр за рубли. Товары заводятся в Студии с теми же id, что в каталоге игры;
 * все они постоянные (`non_consumable`): владение хранит площадка и отдаёт в `getPurchases`,
 * поэтому своей проверки подписи на сервере не нужно — нечего начислять. Купить может только
 * вошедший игрок: окно входа SDK покажет сам. Пока открыты окна оплаты и входа — игра на паузе.
 */
class PikabuPayments implements Payments {
  constructor(
    private readonly sdk: PkbSDK,
    private readonly pause: (paused: boolean) => void,
  ) {}

  async prices(): Promise<Record<string, string>> {
    const list = await this.sdk.store.getProducts().catch(() => []);
    return Object.fromEntries(list.map((p) => [p.id, p.formattedPrice]));
  }

  async owned(): Promise<string[] | null> {
    const list = await this.sdk.store.getPurchases().catch(() => null);
    return list ? list.map((p) => p.productId).filter(isPermanent) : null;
  }

  async buy(productId: string): Promise<PurchaseResult> {
    this.pause(true);
    try {
      const result = await this.sdk.store.purchase({ productId });
      if (result.success) return 'paid';
      // Уже куплено (на другом устройстве) — для игры это та же покупка
      if (result.reason === 'NON_CONSUMABLE_ALREADY_OWNED') return 'paid';
      return result.reason === 'USER_CANCELLED' || result.reason === 'USER_UNAUTHORIZED' ? 'cancelled' : 'failed';
    } catch {
      return 'failed';
    } finally {
      this.pause(false);
    }
  }
}

/**
 * Пикабу Игры. Требования площадки, которые закрывает адаптер: SDK и `gameStarted()` после
 * первого экрана, реклама в паузах (полноэкранная между созвездиями, за награду — по кнопке)
 * с паузой игры и звука, облачные сохранения `sdk.storage`, покупки площадки, русский язык.
 * Реклама при загрузке — со второго запуска (PK.17). Без SDK (блокировщик рекламы, сборка вне
 * площадки) игра работает как обычный веб: без рекламы и покупок.
 */
export class PikabuPlatform implements Platform {
  readonly id = 'pikabu' as const;
  rewardedAvailable = false;
  interstitialAvailable = false;
  payments: Payments | null = null;
  /** Всё новое 0.7.4 включено (решение Дениса для Пикабу). */
  readonly features = FEATURES;
  /** Сохранения игрока хранит Пикабу у аккаунта: после входа на новом устройстве главнее они. */
  readonly cloudFirst = true;
  private sdk: PkbSDK | null = null;
  private pauseListeners: ((paused: boolean) => void)[] = [];

  async init(): Promise<void> {
    // Площадка открывает игру во фрейме; сборка, открытая напрямую, не ждёт SDK впустую
    if (window.top === window) return;
    try {
      // Сеть не отдала SDK — игра не висит на заставке: через 10 с запускаемся как веб
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SDK timeout')), 10_000));
      if (!window.PkbSDK) await Promise.race([loadScript(SDK_URL), timeout]);
      this.sdk = (await Promise.race([window.PkbSDK?.init(), timeout])) ?? null;
    } catch {
      this.sdk = null;
    }
    const sdk = this.sdk;
    if (!sdk) return;
    this.interstitialAvailable = sdk.ads.fullscreen.isSupported;
    this.rewardedAvailable = sdk.ads.rewarded.isSupported;
    this.payments = new PikabuPayments(sdk, (paused) => this.emitPause(paused));
    sdk.on('storageSaveError', (reason) => console.warn('Пикабу: сохранение не удалось', reason));
  }

  /**
   * Перед стартом — реклама при загрузке (PK.17, решение Дениса): только со второго запуска,
   * на первом никогда. Площадка показывает её лишь на телефонах и до `gameStarted()`; баннер
   * закрывается сразу, на время показа — пауза и тишина. Нет баннера — игра стартует сразу.
   */
  async ready(returning: boolean): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) return;
    const pre = sdk.ads.preloader;
    if (returning && pre?.isSupported) {
      track('ad_request', { kind: 'preloader', placement: 'launch' });
      const outcome = await this.ad(pre, 'shown');
      track('ad_result', { kind: 'preloader', placement: 'launch', ...outcome });
    }
    sdk.gameStarted();
  }

  // Начало и конец игрового процесса площадке не нужны
  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<AdOutcome> {
    return this.ad(this.sdk?.ads.fullscreen, 'shown');
  }

  async showRewarded(): Promise<AdOutcome> {
    return this.ad(this.sdk?.ads.rewarded, 'rewarded');
  }

  async canShowRewarded(): Promise<boolean> {
    const ad = this.sdk?.ads.rewarded;
    return !!ad?.isSupported && (await ad.canShow().catch(() => false));
  }

  /**
   * Ролик: перед показом спросить площадку; пока он идёт — пауза и тишина. За награду —
   * только досмотренный (`reward`); `rendered: false` — площадка не показала, её код в `reason`.
   */
  private async ad(ad: PkbAd | undefined, done: 'shown' | 'rewarded'): Promise<AdOutcome> {
    if (!ad?.isSupported) return { result: 'nofill', reason: 'NOT_SUPPORTED' };
    if (!(await ad.canShow().catch(() => false))) return { result: 'nofill', reason: 'CANNOT_SHOW' };
    this.emitPause(true);
    try {
      const r = await ad.show();
      if (!r.rendered) return { result: 'nofill', reason: r.reason };
      return done === 'rewarded' && r.reward !== true ? { result: 'closed' } : { result: done };
    } catch {
      return { result: 'error' };
    } finally {
      this.emitPause(false);
    }
  }

  /** Площадка русская: игроки при запуске видят игру на русском (требование). */
  language(): Lang | null {
    return 'ru';
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    const all = this.sdk?.storage.getAll();
    if (!all) return null;
    const data = Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => typeof e[1] === 'string'));
    return Object.keys(data).length ? data : null;
  }

  async cloudSave(data: Record<string, string>): Promise<void> {
    // На сервер уходят только изменённые ключи; сохраняет SDK сам, с небольшой задержкой
    this.sdk?.storage.replaceAll(data);
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseListeners.push(fn);
  }

  /** Вызов друга ведёт на страницу игры на Пикабу: ссылки на свой сайт площадка запрещает. */
  inviteUrl(): string | null {
    return import.meta.env.VITE_PIKABU_GAME_URL || 'https://games.pikabu.ru/game/zvyozdnoe-pletenie';
  }

  private emitPause(paused: boolean): void {
    for (const fn of this.pauseListeners) fn(paused);
  }
}
