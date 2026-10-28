import { describe, expect, it } from 'vitest';
import { FEATURES, resolveFeatures } from '../src/platform/features';
import { PikabuPlatform } from '../src/platform/pikabu';

describe('переключатели площадки', () => {
  it('без площадки всё выключено', () => {
    expect(Object.values(resolveFeatures())).toEqual(FEATURES.map(() => false));
  });

  it('Пикабу включает всё новое', () => {
    expect(Object.values(resolveFeatures(new PikabuPlatform().features)).every(Boolean)).toBe(true);
  });

  it('?ff= включает и выключает поверх площадки', () => {
    const f = resolveFeatures(['music', 'quickStart'], 'wideDesktop,-music, nope');
    expect(f).toMatchObject({ quickStart: true, wideDesktop: true, music: false, shortTutorial: false });
    expect(Object.values(resolveFeatures([], 'all')).every(Boolean)).toBe(true);
    expect(Object.values(resolveFeatures(FEATURES, 'none')).some(Boolean)).toBe(false);
  });
});
