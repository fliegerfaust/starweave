import { afterEach, describe, expect, it } from 'vitest';
import { CrazyGamesPlatform, SAVE_KEY, type CGSDK } from '../src/platform/crazygames';
import { PRODUCTS } from '../src/store/catalog';

type AdCallbacks = Parameters<CGSDK['ad']['requestAd']>[1];

/** Поддельный SDK: запоминает вызовы, рекламу «показывает» тот, кто вызвал `nextAd`. */
function fakeSdk(over: Partial<{ environment: CGSDK['environment']; locale: string; muted: boolean }> = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  let ad: AdCallbacks | null = null;
  let settingsFn: ((s: { muteAudio: boolean }) => void) | null = null;
  const sdk: CGSDK = {
    init: async () => undefined,
    environment: over.environment ?? 'crazygames',
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
      inviteLink: (p) => `https://www.crazygames.com/game/starweave?startapp=${p.startapp}`,
      getInviteParam: (name) => (name === 'startapp' ? 'c_abc' : null),
      settings: { muteAudio: over.muted ?? false },
      addSettingsChangeListener: (fn) => (settingsFn = fn),
    },
    ad: { requestAd: (type, cb) => (calls.push(`ad:${type}`), (ad = cb)) },
    user: { systemInfo: { locale: over.locale ?? 'en-US' } },
    data: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
  };
  (globalThis as { window?: unknown }).window = { CrazyGames: { SDK: sdk } };
  return { calls, store, ad: () => ad!, settings: (muteAudio: boolean) => settingsFn?.({ muteAudio }) };
}

async function platform(ads = true, over?: Parameters<typeof fakeSdk>[0]) {
  const sdk = fakeSdk(over);
  const p = new CrazyGamesPlatform(ads);
  await p.init();
  return { p, sdk };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('площадка CrazyGames', () => {
  it('загрузка и игра отмечаются в SDK, повторный start не дублируется', async () => {
    const { p, sdk } = await platform();
    p.ready();
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    expect(sdk.calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop']);
  });

  it('на Basic Launch (сборка без рекламы) кнопок рекламы нет и SDK не просим', async () => {
    const { p, sdk } = await platform(false);
    expect(p.rewardedAvailable).toBe(false);
    expect(p.interstitialAvailable).toBe(false);
    expect(await p.showRewarded()).toBe(false);
    await p.showInterstitial();
    expect(sdk.calls.some((c) => c.startsWith('ad:'))).toBe(false);
  });

  it('награда — только за досмотренный ролик; на время ролика пауза и стоп игры', async () => {
    const { p, sdk } = await platform();
    const pauses: boolean[] = [];
    p.onPauseChange((x) => pauses.push(x));
    p.gameplayStart();
    const res = p.showRewarded();
    sdk.ad().adStarted?.();
    sdk.ad().adFinished?.();
    expect(await res).toBe(true);
    expect(pauses).toEqual([true, false]);
    expect(sdk.calls).toEqual(['loadingStart', 'gameplayStart', 'ad:rewarded', 'gameplayStop', 'gameplayStart']);

    const failed = p.showRewarded();
    sdk.ad().adError?.({ code: 'other' });
    expect(await failed).toBe(false);
  });

  it('adsDisabledBasicLaunch выключает рекламу до перезапуска', async () => {
    const { p, sdk } = await platform();
    const res = p.showRewarded();
    sdk.ad().adError?.({ code: 'adsDisabledBasicLaunch' });
    expect(await res).toBe(false);
    expect(p.rewardedAvailable).toBe(false);
    expect(p.interstitialAvailable).toBe(false);
  });

  it('звук глушит настройка сайта — и до загрузки, и на лету', async () => {
    const { p, sdk } = await platform(true, { muted: true });
    const muted: boolean[] = [];
    p.onMuteChange((x) => muted.push(x));
    p.ready();
    sdk.settings(false);
    expect(muted).toEqual([true, false]);
  });

  it('язык из locale: русский для ru/be/kk/uk/uz, иначе английский', async () => {
    expect((await platform(true, { locale: 'ru-RU' })).p.language()).toBe('ru');
    expect((await platform(true, { locale: 'uk' })).p.language()).toBe('ru');
    expect((await platform(true, { locale: 'de-DE' })).p.language()).toBe('en');
  });

  it('сохранения — одной записью Data module; пустые стирают её', async () => {
    const { p, sdk } = await platform();
    await p.cloudSave({ 'starweave.profile.v1': '{"runs":3}' });
    expect(JSON.parse(sdk.store.get(SAVE_KEY)!)).toEqual({ 'starweave.profile.v1': '{"runs":3}' });
    expect(await p.cloudLoad()).toEqual({ 'starweave.profile.v1': '{"runs":3}' });
    await p.cloudSave({});
    expect(sdk.store.has(SAVE_KEY)).toBe(false);
    expect(await p.cloudLoad()).toBeNull();
  });

  it('вызов друга ведёт на страницу игры на CrazyGames', async () => {
    const { p } = await platform();
    expect(p.inviteUrl('c_xyz')).toBe('https://www.crazygames.com/game/starweave?startapp=c_xyz');
    expect(p.startParam()).toBe('c_abc');
  });

  it('вне портала (environment disabled) — как обычный веб', async () => {
    const { p, sdk } = await platform(true, { environment: 'disabled' });
    p.ready();
    p.gameplayStart();
    expect(sdk.calls).toEqual([]);
    expect(p.rewardedAvailable).toBe(false);
    expect(p.language()).toBeNull();
  });

  it('даром открыт атлас и платный внешний вид, но не набор мецената', () => {
    const p = new CrazyGamesPlatform(false);
    const paid = PRODUCTS.filter((x) => x.kind !== 'tip' && x.id !== 'supporter').map((x) => x.id);
    expect([...p.grants].sort()).toEqual(paid.sort());
  });
});
