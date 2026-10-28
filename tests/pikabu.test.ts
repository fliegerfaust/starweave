import { afterEach, describe, expect, it } from 'vitest';
import { PikabuPlatform, type PkbSDK } from '../src/platform/pikabu';
import { FEATURES } from '../src/platform/features';

type Ad = PkbSDK['ads']['fullscreen'];

/** Поддельный SDK Пикабу: запоминает вызовы, ответы рекламы и оплаты задаёт тест. */
function fakeSdk(over: Partial<{ canShow: boolean; reward: boolean; purchase: Awaited<ReturnType<PkbSDK['store']['purchase']>> }> = {}) {
  const calls: string[] = [];
  let storage: Record<string, unknown> = {};
  const ad = (name: string, reward?: boolean): Ad => ({
    isSupported: true,
    canShow: async () => over.canShow ?? true,
    show: async () => (calls.push(`show:${name}`), { rendered: true, reward }),
  });
  const sdk: PkbSDK = {
    gameStarted: () => calls.push('gameStarted'),
    player: { isAuthorized: false },
    ads: { preloader: ad('preloader'), fullscreen: ad('fullscreen'), rewarded: ad('rewarded', over.reward ?? true) },
    store: {
      getProducts: async () => [{ id: 'atlas', formattedPrice: '299 ₽' }],
      getPurchases: async () => [
        { productId: 'atlas', purchaseId: 'p1', isConsumable: false },
        { productId: 'unknown', purchaseId: 'p2', isConsumable: false },
      ],
      purchase: async ({ productId }) => (calls.push(`buy:${productId}`), over.purchase ?? { success: true, purchase: { productId, purchaseId: 'p3', isConsumable: false } }),
    },
    storage: {
      getAll: () => ({ ...storage }),
      replaceAll: (data) => void (storage = { ...data }),
    },
    on: () => () => undefined,
  };
  (globalThis as { window?: unknown }).window = { PkbSDK: { init: async () => sdk } };
  return { calls, storage: () => storage, setStorage: (s: Record<string, unknown>) => void (storage = s) };
}

async function platform(over?: Parameters<typeof fakeSdk>[0]) {
  const sdk = fakeSdk(over);
  const p = new PikabuPlatform();
  await p.init();
  const pauses: boolean[] = [];
  p.onPauseChange((v) => pauses.push(v));
  return { p, sdk, pauses };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('площадка Пикабу Игры', () => {
  it('готовность — gameStarted, язык русский, все переключатели CQ включены', async () => {
    const { p, sdk } = await platform();
    await p.ready(false);
    expect(sdk.calls).toEqual(['gameStarted']);
    expect(p.language()).toBe('ru');
    expect(p.features).toEqual(FEATURES);
  });

  it('реклама при загрузке — только со второго запуска и до gameStarted (PK.17)', async () => {
    const first = await platform();
    await first.p.ready(false);
    expect(first.sdk.calls).toEqual(['gameStarted']);
    const again = await platform();
    await again.p.ready(true);
    expect(again.sdk.calls).toEqual(['show:preloader', 'gameStarted']);
    expect(again.pauses).toEqual([true, false]);
  });

  it('реклама на паузе игры; награда — только за досмотренный ролик (PK.15)', async () => {
    const { p, sdk, pauses } = await platform();
    expect(await p.showInterstitial()).toEqual({ result: 'shown' });
    expect(await p.showRewarded()).toEqual({ result: 'rewarded' });
    expect(sdk.calls).toEqual(['show:fullscreen', 'show:rewarded']);
    expect(pauses).toEqual([true, false, true, false]);

    const skipped = await platform({ reward: false });
    expect(await skipped.p.showRewarded()).toEqual({ result: 'closed' });
  });

  it('площадка не даёт показать ролик — «нет ролика», без паузы и без кнопки награды', async () => {
    const { p, sdk, pauses } = await platform({ canShow: false });
    expect((await p.showInterstitial()).result).toBe('nofill');
    expect((await p.showRewarded()).result).toBe('nofill');
    expect(await p.canShowRewarded()).toBe(false);
    expect(sdk.calls).toEqual([]);
    expect(pauses).toEqual([]);
  });

  it('покупки: цены и купленное из SDK, отмена и «уже куплено»', async () => {
    const { p, pauses } = await platform();
    expect(await p.payments!.prices()).toEqual({ atlas: '299 ₽' });
    expect(await p.payments!.owned()).toEqual(['atlas']);
    expect(await p.payments!.buy('atlas')).toBe('paid');
    expect(pauses).toEqual([true, false]);

    const cancelled = await platform({ purchase: { success: false, reason: 'USER_CANCELLED' } });
    expect(await cancelled.p.payments!.buy('atlas')).toBe('cancelled');
    const owned = await platform({ purchase: { success: false, reason: 'NON_CONSUMABLE_ALREADY_OWNED' } });
    expect(await owned.p.payments!.buy('atlas')).toBe('paid');
    const failed = await platform({ purchase: { success: false, reason: 'UNKNOWN' } });
    expect(await failed.p.payments!.buy('atlas')).toBe('failed');
  });

  it('облачные сохранения — строки в sdk.storage, пустое хранилище — null', async () => {
    const { p, sdk } = await platform();
    expect(await p.cloudLoad()).toBeNull();
    await p.cloudSave({ profile: '{"runs":1}', settings: '{}' });
    expect(sdk.storage()).toEqual({ profile: '{"runs":1}', settings: '{}' });
    sdk.setStorage({ profile: '{"runs":2}', junk: 5 });
    expect(await p.cloudLoad()).toEqual({ profile: '{"runs":2}' });
  });

  it('без SDK (блокировщик рекламы) — обычный веб: без рекламы и покупок', async () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { document?: unknown }).document = { createElement: () => ({}), head: { append: (s: { onerror?: () => void }) => s.onerror?.() } };
    const p = new PikabuPlatform();
    await p.init();
    delete (globalThis as { document?: unknown }).document;
    expect(p.payments).toBeNull();
    expect(p.rewardedAvailable).toBe(false);
    expect((await p.showRewarded()).result).toBe('nofill');
    expect(await p.cloudLoad()).toBeNull();
    await p.ready(true);
  });

  it('вызов друга ведёт на Пикабу, не на свой сайт', async () => {
    const { p } = await platform();
    expect(p.inviteUrl()).toMatch(/^https:\/\/games\.pikabu\.ru\//);
  });
});
