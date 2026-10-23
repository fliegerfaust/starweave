import type { Platform } from './types';
import { WebPlatform } from './web';

export type { Payments, Platform, PurchaseResult } from './types';
export { FEATURES, resolveFeatures, type Feature, type Features } from './features';

/**
 * Яндекс и CrazyGames выбираются при сборке (`VITE_PLATFORM=yandex|crazygames`): у порталов свои архивы.
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
  const { isTelegramLaunch } = await import('./telegram');
  if (isTelegramLaunch()) {
    const { TelegramPlatform } = await import('./telegram');
    return new TelegramPlatform();
  }
  return new WebPlatform();
}
