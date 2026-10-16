import { describe, expect, it } from 'vitest';
import { AD_GAP_MS, FIRST_DAY_MS, interstitialAllowed } from '../src/game/ad-pacing';

describe('частота межстраничной рекламы', () => {
  const day2 = FIRST_DAY_MS + 1;
  it('в первые сутки игрока — нет', () => {
    expect(interstitialAllowed(FIRST_DAY_MS - 1, 0, null)).toBe(false);
    expect(interstitialAllowed(day2, 0, null)).toBe(true);
  });
  it('после любой рекламы — 10 минут тишины', () => {
    expect(interstitialAllowed(day2 + AD_GAP_MS - 1, 0, day2)).toBe(false);
    expect(interstitialAllowed(day2 + AD_GAP_MS, 0, day2)).toBe(true);
  });
});
