import type { Platform } from './types';
import { WebPlatform } from './web';

export type { Payments, Platform, PurchaseResult } from './types';

/**
 * Яндекс выбирается при сборке (`VITE_PLATFORM=yandex npm run build`): у портала свой архив.
 * Telegram — по параметрам запуска: Mini App открывает тот же сайт, что и браузер.
 */
export async function createPlatform(): Promise<Platform> {
  if (import.meta.env.VITE_PLATFORM === 'yandex') {
    const { YandexPlatform } = await import('./yandex');
    return new YandexPlatform();
  }
  const { isTelegramLaunch } = await import('./telegram');
  if (isTelegramLaunch()) {
    const { TelegramPlatform } = await import('./telegram');
    return new TelegramPlatform();
  }
  return new WebPlatform();
}
