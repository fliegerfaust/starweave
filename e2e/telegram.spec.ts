import { expect, test } from '@playwright/test';

/**
 * Игра как Telegram Mini App: подменяем Telegram.WebApp и проверяем, что игра
 * его использует — готовность, развёртывание, цвета, облачные сохранения, вибрация, язык.
 */
test('Telegram Mini App', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-15', 'достаточно одного устройства');
  await page.addInitScript(() => {
    const calls: string[] = [];
    const store: Record<string, string> = {};
    (window as unknown as { __tg: { calls: string[]; store: Record<string, string> } }).__tg = { calls, store };
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        version: '8.0',
        platform: 'ios',
        initData: 'x',
        initDataUnsafe: { user: { language_code: 'ru' } },
        isVersionAtLeast: () => true,
        ready: () => calls.push('ready'),
        expand: () => calls.push('expand'),
        requestFullscreen: () => calls.push('fullscreen'),
        disableVerticalSwipes: () => calls.push('noSwipes'),
        setHeaderColor: (c: string) => calls.push(`header:${c}`),
        setBackgroundColor: () => calls.push('bg'),
        setBottomBarColor: () => calls.push('bottom'),
        openTelegramLink: (url: string) => calls.push(`link:${url}`),
        onEvent: () => undefined,
        HapticFeedback: {
          impactOccurred: (s: string) => calls.push(`impact:${s}`),
          notificationOccurred: (s: string) => calls.push(`notify:${s}`),
          selectionChanged: () => calls.push('selection'),
        },
        CloudStorage: {
          setItem: (k: string, v: string, cb?: () => void) => {
            store[k] = v;
            cb?.();
          },
          getItem: (k: string, cb: (e: null, v?: string) => void) => cb(null, store[k]),
          getItems: (ks: string[], cb: (e: null, v: Record<string, string>) => void) => cb(null, Object.fromEntries(ks.map((k) => [k, store[k] ?? '']))),
        },
      },
    };
  });
  await page.goto('/#tgWebAppData=x&tgWebAppVersion=8.0&tgWebAppPlatform=ios');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  const calls = () => page.evaluate(() => (window as unknown as { __tg: { calls: string[] } }).__tg.calls);
  await expect.poll(calls).toContain('ready');
  const started = await calls();
  expect(started).toEqual(expect.arrayContaining(['expand', 'fullscreen', 'noSwipes', 'header:#070818']));
  expect(await page.evaluate(() => document.documentElement.classList.contains('tg'))).toBe(true);
  expect(await page.locator('.menu-buttons .btn').first().textContent()).toMatch(/Обучение|Новый забег|Продолжить/);
  // Подсказки «на весь экран» — только для своего сайта
  expect(await page.locator('.home-link').count()).toBe(0);

  // Нажатие кнопки даёт отклик через Telegram
  await page.locator('.menu-buttons .btn').first().click();
  await expect.poll(calls).toEqual(expect.arrayContaining([expect.stringMatching(/^(impact|selection)/)]));

  // Прогресс уходит в CloudStorage кусками с оглавлением
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; startRun(s: string): void } }).starweave;
    app.profile.tutorialDone = true;
    app.startRun('classic');
  });
  await page.waitForSelector('.map');
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as unknown as { __tg: { store: Record<string, string> } }).__tg.store)), { timeout: 8000 })
    .toContain('sw_index');
});
