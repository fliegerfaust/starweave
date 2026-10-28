/**
 * Когда можно показать межстраничную рекламу (решение Дениса 28.10.2026, все площадки):
 * только между главами — это решает вызывающий; первая — при входе во вторую главу, дальше
 * на каждом переходе, и не чаще раза в 2 минуты после любой рекламы (и за награду тоже).
 * Правило «новичок первые сутки без рекламы» снято.
 */
export const AD_GAP_MS = 2 * 60_000;
/** С какой главы показываем: первая глава всегда без межстраничной рекламы. */
export const FIRST_AD_ANTE = 2;

export function interstitialAllowed(now: number, ante: number, lastAdAt: number | null): boolean {
  if (ante < FIRST_AD_ANTE) return false;
  return lastAdAt === null || now - lastAdAt >= AD_GAP_MS;
}
