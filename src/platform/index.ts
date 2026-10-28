import type { Platform } from './types';
import { WebPlatform } from './web';

export type { AdOutcome, AdResult, Payments, Platform, PurchaseResult } from './types';
export { FEATURES, resolveFeatures, type Feature, type Features } from './features';

/**
 * Яндекс, CrazyGames и Пикабу выбираются при сборке (`VITE_PLATFORM=yandex|crazygames|pikabu`): у порталов свои сборки.
 * Telegram — по параметрам запуска: Mini App открывает тот же сайт, что и браузер.
 */
export async function createPlatform(): Promise<Platform> {
  if (import.meta.env.VITE_PLATFORM === 'yandex') {
    const { YandexPlatform } = await import('./yandex');
    return new YandexPlatform();
  }
  if (import.meta.env.VITE_PLATFORM === 'crazygames') {
    const { CrazyGamesPlatform } = await import('./crazygames');
    return new CrazyGamesPlatform();
  }
  if (import.meta.env.VITE_PLATFORM === 'pikabu') {
    const { PikabuPlatform } = await import('./pikabu');
    return new PikabuPlatform();
  }
  const { isTelegramLaunch } = await import('./telegram');
  if (isTelegramLaunch()) {
    const { TelegramPlatform } = await import('./telegram');
    return new TelegramPlatform();
  }
  return new WebPlatform();
}
