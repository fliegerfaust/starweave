import { describe, expect, it } from 'vitest';
import { AD_GAP_MS, FIRST_AD_ANTE, interstitialAllowed } from '../src/game/ad-pacing';

describe('частота межстраничной рекламы', () => {
  it('первая глава без рекламы, со второй — можно', () => {
    expect(interstitialAllowed(0, 1, null)).toBe(false);
    expect(interstitialAllowed(0, FIRST_AD_ANTE, null)).toBe(true);
  });

  it('после любой рекламы — 2 минуты тишины', () => {
    const t = 1_000_000;
    expect(AD_GAP_MS).toBe(120_000);
    expect(interstitialAllowed(t + AD_GAP_MS - 1, 3, t)).toBe(false);
    expect(interstitialAllowed(t + AD_GAP_MS, 3, t)).toBe(true);
  });
});
