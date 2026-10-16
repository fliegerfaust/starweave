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
  // Скрипт аналитики Telegram подменяем: проверяем, что игра его инициализирует ключом
  await page.route('https://tganalytics.xyz/index.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.telegramAnalytics = { init: (o) => { window.__tga = o; } };' }),
  );
  await page.goto('/#tgWebAppData=x&tgWebAppVersion=8.0&tgWebAppPlatform=ios');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  const calls = () => page.evaluate(() => (window as unknown as { __tg: { calls: string[] } }).__tg.calls);
  await expect.poll(calls).toContain('ready');
  const started = await calls();
  expect(started).toEqual(expect.arrayContaining(['expand', 'fullscreen', 'noSwipes', 'header:#070818']));
  expect(await page.evaluate(() => document.documentElement.classList.contains('tg'))).toBe(true);
  // С ключом (TG_ANALYTICS_* при сборке) аналитика Telegram получает токен и имя приложения
  if (process.env.VITE_TG_ANALYTICS_TOKEN) {
    expect(await page.evaluate(() => (window as unknown as { __tga?: unknown }).__tga)).toEqual({
      token: process.env.VITE_TG_ANALYTICS_TOKEN,
      appName: process.env.VITE_TG_ANALYTICS_APP,
    });
  }
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

/** Реклама за награду в Telegram — AdsGram: досмотр даёт награду, пропуск — нет, звук на паузе. */
test('Telegram: реклама за награду через AdsGram', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-15', 'достаточно одного устройства');
  await page.addInitScript(() => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        version: '8.0', platform: 'ios', initData: '', initDataUnsafe: {},
        isVersionAtLeast: () => true, ready() {}, expand() {}, onEvent() {}, openTelegramLink() {},
      },
    };
  });
  // Первый показ досмотрен, второй пропущен; во время показа запоминаем, молчит ли звук
  await page.route('https://sad.adsgram.ai/js/sad.min.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.__ads = { inits: [], shows: 0, muted: [] };
        window.Adsgram = { init(p) { window.__ads.inits.push(p.blockId); return { show() {
          const n = ++window.__ads.shows;
          window.__ads.muted.push(window.starweave.adPlaying);
          return n === 1 ? Promise.resolve({ done: true, state: 'destroy', error: false, description: '' })
            : Promise.reject({ done: false, state: 'playing', error: false, description: 'The banner was skipped' });
        } }; } };`,
    }),
  );
  await page.goto('/#tgWebAppData=x&tgWebAppVersion=8.0&tgWebAppPlatform=ios');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  type P = { platform: { rewardedAvailable: boolean; showRewarded(): Promise<boolean> }; adPlaying: boolean };
  const res = await page.evaluate(async () => {
    const app = (window as unknown as { starweave: P }).starweave;
    const available = app.platform.rewardedAvailable;
    const first = await app.platform.showRewarded();
    const second = await app.platform.showRewarded();
    return { available, first, second, after: app.adPlaying, ads: (window as unknown as { __ads: unknown }).__ads };
  });
  expect(res).toEqual({ available: true, first: true, second: false, after: false, ads: { inits: ['e2e'], shows: 2, muted: [true, true] } });
});
