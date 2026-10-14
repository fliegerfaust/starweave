import type { Lang } from '@/i18n';
import { chunkKeys, INDEX_KEY, pack, unpack } from './telegram-cloud';
import { StarsPayments, apiBase } from '@/store/stars-payments';
import type { Payments, Platform } from './types';

/** Часть Telegram Mini Apps API, которой пользуется игра (core.telegram.org/bots/webapps). */
interface TelegramWebApp {
  version: string;
  platform: string;
  initData: string;
  initDataUnsafe: { user?: { language_code?: string }; start_param?: string };
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  openTelegramLink(url: string): void;
  openInvoice?(url: string, callback: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  onEvent(event: string, handler: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    telegramAnalytics?: { init(opts: { token: string; appName: string }): Promise<void> | void };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
/** Аналитика Telegram Mini Apps (TON Builders): запуски, удержание, место в каталоге. */
const ANALYTICS_URL = 'https://tganalytics.xyz/index.js';
const NIGHT = '#070818';

/**
 * Запущены ли мы как Telegram Mini App. Telegram передаёт параметры запуска в адресе
 * (`#tgWebAppData=…`); после перезагрузки внутри Telegram их хранит sessionStorage.
 */
export function isTelegramLaunch(): boolean {
  if (/tgWebApp(Data|Version|Platform)=/.test(location.hash + location.search)) return true;
  try {
    return !!sessionStorage.getItem('__telegram__initParams');
  } catch {
    return false;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`не загрузился ${src}`));
    document.head.append(s);
  });
}

/**
 * Telegram Mini App: игра открывается из бота прямо в Telegram. Покупки — за Telegram
 * Stars через наш сервер (счета выставляет бот). Даёт то, чего нет у браузера на iPhone:
 * тактильные отклики через HapticFeedback клиента Telegram.
 */
export class TelegramPlatform implements Platform {
  readonly id = 'telegram' as const;
  readonly rewardedAvailable = false;
  payments: Payments | null = null;
  private app: TelegramWebApp | null = null;
  private pauseListeners: ((paused: boolean) => void)[] = [];

  async init(): Promise<void> {
    try {
      if (!window.Telegram?.WebApp) await loadScript(SDK_URL);
      this.app = window.Telegram?.WebApp ?? null;
    } catch {
      this.app = null; // без SDK работаем как обычный веб
    }
    const app = this.app;
    if (!app) return;
    document.documentElement.classList.add('tg');
    app.expand();
    // Свайп вниз закрывает Mini App — а мы тянем карты пальцем
    if (app.isVersionAtLeast('7.7')) app.disableVerticalSwipes?.();
    if (app.isVersionAtLeast('6.1')) {
      app.setHeaderColor?.(NIGHT);
      app.setBackgroundColor?.(NIGHT);
    }
    if (app.isVersionAtLeast('7.10')) app.setBottomBarColor?.(NIGHT);
    // На телефонах — весь экран: полю нужна каждая строчка высоты
    if (app.isVersionAtLeast('8.0') && (app.platform === 'ios' || app.platform === 'android')) app.requestFullscreen?.();
    const base = apiBase();
    if (base && app.initData && app.isVersionAtLeast('6.1') && app.openInvoice) {
      this.payments = new StarsPayments({ initData: app.initData, openInvoice: (url, cb) => app.openInvoice!(url, cb) }, base);
    }
    app.onEvent('deactivated', () => this.emitPause(true));
    app.onEvent('activated', () => this.emitPause(false));
    await this.initAnalytics();
  }

  /**
   * Аналитика Telegram — до первой отрисовки, как требует SDK. Включается ключом из
   * @DataChief_bot (переменные репозитория TG_ANALYTICS_TOKEN и TG_ANALYTICS_APP);
   * без ключа или при сбое загрузки игра работает как обычно.
   */
  private async initAnalytics(): Promise<void> {
    const token = import.meta.env.VITE_TG_ANALYTICS_TOKEN;
    const appName = import.meta.env.VITE_TG_ANALYTICS_APP;
    if (!token || !appName) return;
    try {
      await loadScript(ANALYTICS_URL);
      await window.telegramAnalytics?.init({ token, appName });
    } catch {
      /* аналитика не должна мешать игре */
    }
  }

  ready(): void {
    this.app?.ready();
  }

  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<void> {}

  async showRewarded(): Promise<boolean> {
    return false;
  }

  language(): Lang | null {
    const code = this.app?.initDataUnsafe.user?.language_code;
    if (!code) return null;
    return ['ru', 'be', 'kk', 'uk', 'uz'].includes(code) ? 'ru' : 'en';
  }

  async cloudLoad(): Promise<Record<string, string> | null> {
    const cloud = this.cloud();
    if (!cloud) return null;
    const indexRaw = await new Promise<string | null>((resolve) => cloud.getItem(INDEX_KEY, (err, value) => resolve(err ? null : (value ?? null))));
    if (!indexRaw) return null;
    let index: Record<string, number>;
    try {
      index = JSON.parse(indexRaw) as Record<string, number>;
    } catch {
      return null;
    }
    const items = await new Promise<Record<string, string>>((resolve) => cloud.getItems(chunkKeys(index), (err, values) => resolve(err ? {} : (values ?? {}))));
    const data = unpack(index, items);
    return Object.keys(data).length ? data : null;
  }

  async cloudSave(data: Record<string, string>): Promise<void> {
    const cloud = this.cloud();
    if (!cloud) return;
    const { items } = pack(data);
    // Оглавление пишем последним: если запись оборвётся, старое оглавление укажет на старые куски
    const { [INDEX_KEY]: index, ...chunks } = items;
    await Promise.all(Object.entries(chunks).map(([key, value]) => new Promise<void>((resolve) => cloud.setItem(key, value, () => resolve()))));
    await new Promise<void>((resolve) => cloud.setItem(INDEX_KEY, index!, () => resolve()));
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseListeners.push(fn);
  }

  /** Поделиться через выбор чата Telegram: текст и ссылка на игру (с вызовом — если передан). */
  share(text: string, startParam?: string): boolean {
    if (!this.app) return false;
    const base = import.meta.env.VITE_TG_APP_LINK || location.origin + location.pathname;
    const link = startParam ? `${base}?startapp=${startParam}` : base;
    this.app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    return true;
  }

  startParam(): string | null {
    const params = new URLSearchParams(location.search);
    return this.app?.initDataUnsafe.start_param || params.get('tgWebAppStartParam') || params.get('startapp');
  }

  private cloud(): TelegramWebApp['CloudStorage'] | null {
    return this.app?.isVersionAtLeast('6.9') ? (this.app.CloudStorage ?? null) : null;
  }

  private emitPause(paused: boolean): void {
    for (const fn of this.pauseListeners) fn(paused);
  }
}
