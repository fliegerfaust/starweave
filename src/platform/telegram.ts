import type { Lang } from '@/i18n';
import { chunkKeys, INDEX_KEY, pack, unpack } from './telegram-cloud';
import { StarsPayments, apiBase } from '@/store/stars-payments';
import { FEATURES } from './features';
import type { Payments, AdOutcome, Platform } from './types';

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
    Adsgram?: { init(params: { blockId: string; debug?: boolean }): AdsgramController };
  }
}

/** Ответ AdsGram на показ (docs.adsgram.ai/publisher/typescript). */
interface AdsgramResult {
  done: boolean;
  description: string;
  state: 'load' | 'render' | 'playing' | 'destroy';
  error: boolean;
}

interface AdsgramController {
  /** Разрешается после досмотра (`done`), отклоняется при пропуске, ошибке или без рекламы. */
  show(): Promise<AdsgramResult>;
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
/** Аналитика Telegram Mini Apps (TON Builders): запуски, удержание, место в каталоге. */
const ANALYTICS_URL = 'https://tganalytics.xyz/index.js';
const NIGHT = '#070818';
/** Реклама за награду в Mini Apps — AdsGram; блок заводится в partner.adsgram.ai (docs/ADS.md). */
const ADSGRAM_URL = 'https://sad.adsgram.ai/js/sad.min.js';

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

/** `timeoutMs` — не ждать дольше: игра не должна висеть на чужом медленном сервере. */
function loadScript(src: string, timeoutMs = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (timeoutMs > 0) window.setTimeout(() => reject(new Error(`долго грузится ${src}`)), timeoutMs);
    const s = document.createElement('script');
    // Оба сервера (telegram.org, tganalytics.xyz) отдают Access-Control-Allow-Origin: * —
    // с crossorigin их ошибки приходят с текстом и местом, а не как «Script error.»
    s.crossOrigin = 'anonymous';
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
  /** Реклама есть, если заданы блоки AdsGram (`ADSGRAM_BLOCK_ID`, `ADSGRAM_INTER_ID`). */
  rewardedAvailable = false;
  interstitialAvailable = false;
  payments: Payments | null = null;
  /** Всё новое 0.7.4 включено и в Telegram (решение Дениса, выпуск 0.7.8). */
  readonly features = FEATURES;
  private app: TelegramWebApp | null = null;
  private pauseListeners: ((paused: boolean) => void)[] = [];
  private ads: Promise<AdsgramController | null> | null = null;
  private inter: Promise<AdsgramController | null> | null = null;

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
    this.initAds();
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
      // Сервер аналитики бывает недоступен минутами (14.10.2026 — не отвечал совсем), а
      // init ждёт этого до старта игры: дольше 3 с не ждём, играем без аналитики Telegram
      await loadScript(ANALYTICS_URL, 3000);
      const wait = new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
      await Promise.race([window.telegramAnalytics?.init({ token, appName }), wait]);
    } catch {
      /* аналитика не должна мешать игре */
    }
  }

  /**
   * Скрипт AdsGram грузится в фоне и не задерживает запуск; кнопки рекламы видны сразу, а
   * показ дождётся загрузки. Не загрузился — показ вернёт «без награды», игра сообщит об этом.
   */
  private initAds(): void {
    const rewardId = import.meta.env.VITE_ADSGRAM_BLOCK_ID;
    const interId = import.meta.env.VITE_ADSGRAM_INTER_ID;
    if (!rewardId && !interId) return;
    const sdk = loadScript(ADSGRAM_URL, 15000).then(() => true, () => false);
    const controller = (blockId: string) => sdk.then((ok) => (ok ? window.Adsgram?.init({ blockId }) ?? null : null));
    if (rewardId) {
      this.rewardedAvailable = true;
      this.ads = controller(rewardId);
    }
    if (interId) {
      this.interstitialAvailable = true;
      this.inter = controller(interId);
    }
  }

  /** Показ блока AdsGram на паузе игры и звука: true — досмотрен до конца. */
  private async play(ads: Promise<AdsgramController | null> | null, done: AdOutcome['result']): Promise<AdOutcome> {
    const controller = await ads;
    if (!controller) return { result: 'nofill' };
    this.emitPause(true);
    try {
      return (await controller.show()).done ? { result: done } : { result: 'closed' };
    } catch (e) {
      // AdsGram отвечает отказом: на загрузке — рекламы нет, позже — пропустил или сбой
      const r = (e ?? {}) as { state?: string; error?: boolean; description?: string };
      const result = r.state === 'load' ? 'nofill' : r.error ? 'error' : 'closed';
      return { result, ...(r.description ? { reason: r.description.slice(0, 60) } : {}) };
    } finally {
      this.emitPause(false);
    }
  }

  ready(): void {
    this.app?.ready();
  }

  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<AdOutcome> {
    return this.play(this.inter, 'shown');
  }

  async showRewarded(): Promise<AdOutcome> {
    return this.play(this.ads, 'rewarded');
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
