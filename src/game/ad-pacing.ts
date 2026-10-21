/**
 * Когда можно показать межстраничную рекламу (решение Дениса: «не жутко навязчиво»).
 * Только между главами — это решает вызывающий; здесь — частота: новичок первые сутки
 * рекламы не видит, а после любой рекламы (и за награду тоже) — 10 минут тишины.
 */
export const AD_GAP_MS = 10 * 60_000;
export const FIRST_DAY_MS = 24 * 3600_000;

export function interstitialAllowed(now: number, firstSeen: number, lastAdAt: number | null): boolean {
  if (now - firstSeen < FIRST_DAY_MS) return false;
  return lastAdAt === null || now - lastAdAt >= AD_GAP_MS;
}
