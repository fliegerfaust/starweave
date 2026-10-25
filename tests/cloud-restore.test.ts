import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreFromCloud } from '../src/meta/cloud-restore';
import { KEYS } from '../src/meta/storage';
import type { Platform } from '../src/platform';

/** Хранилище в памяти вместо localStorage браузера. */
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

const platform = (cloud: Record<string, string> | null, cloudFirst?: boolean) =>
  ({ cloudFirst, cloudLoad: async () => cloud }) as unknown as Platform;

const ACCOUNT = { [KEYS.profile]: '{"runs":40}', [KEYS.run]: '{"ante":6}' };

describe('сохранения из облака при запуске (CG-107)', () => {
  it('обычная площадка: облако только на пустом устройстве', async () => {
    mem.set(KEYS.profile, '{"runs":1}');
    await restoreFromCloud(platform(ACCOUNT));
    expect(mem.get(KEYS.profile)).toBe('{"runs":1}');

    mem.clear();
    await restoreFromCloud(platform(ACCOUNT));
    expect(mem.get(KEYS.profile)).toBe('{"runs":40}');
  });

  it('Пикабу: вошёл в аккаунт в браузере, где играл гостем, — прогресс аккаунта главнее', async () => {
    mem.set(KEYS.profile, '{"runs":1}');
    mem.set(KEYS.run, '{"ante":1}');
    await restoreFromCloud(platform(ACCOUNT, true));
    expect(mem.get(KEYS.profile)).toBe('{"runs":40}');
    expect(mem.get(KEYS.run)).toBe('{"ante":6}');
  });

  it('Пикабу: у аккаунта забег закончен — гостевой незаконченный забег не остаётся', async () => {
    mem.set(KEYS.profile, '{"runs":1}');
    mem.set(KEYS.run, '{"ante":1}');
    await restoreFromCloud(platform({ [KEYS.profile]: '{"runs":40}' }, true));
    expect(mem.get(KEYS.profile)).toBe('{"runs":40}');
    expect(mem.has(KEYS.run)).toBe(false);
  });

  it('Пикабу: облако пустое или недоступно — своё на устройстве не трогаем', async () => {
    mem.set(KEYS.profile, '{"runs":1}');
    mem.set(KEYS.run, '{"ante":1}');
    await restoreFromCloud(platform(null, true));
    await restoreFromCloud(platform({}, true));
    await restoreFromCloud({ cloudFirst: true, cloudLoad: async () => { throw new Error('сеть'); } } as unknown as Platform);
    expect(mem.get(KEYS.profile)).toBe('{"runs":1}');
    expect(mem.get(KEYS.run)).toBe('{"ante":1}');
  });
});
