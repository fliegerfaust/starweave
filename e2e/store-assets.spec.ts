import { copyFileSync, mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

/**
 * Материалы для витрин: обложки и скриншоты нужных размеров. Запуск:
 * `npm run store-assets` → папка store/. В обычный прогон e2e не входит.
 */
test.skip(!process.env.ASSETS, 'только по npm run store-assets');
test.describe.configure({ mode: 'serial' });

const OUT = 'store';

async function openGame(page: Page, lang: 'ru' | 'en'): Promise<void> {
  await page.addInitScript((l) => {
    localStorage.setItem('starweave.settings.v1', JSON.stringify({ lang: l, sfx: 0, music: 0, speed: 1, reduceMotion: false, haptics: false }));
    localStorage.setItem('starweave.profile.v1', JSON.stringify({ version: 1, tutorialDone: true, runs: 3 }));
  }, lang);
  await page.goto('/');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  await page.waitForTimeout(800);
}

/** Ночь со вспышкой креста — главный «вау» для витрины. */
async function crossMoment(page: Page): Promise<void> {
  // Сценарная первая ночь обучения даёт гарантированный крест «флеш + тройка»
  await page.evaluate(() => (window as unknown as { starweave: { startTutorial(): void } }).starweave.startTutorial());
  await page.waitForSelector('.tut-bubble.on');
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const w = window as unknown as {
      starweave: { tutorial: { stop(): void } | null; run: { night: { hand: { id: number; rank: number; suit: string }[] } } };
      __scene: { setGuide(g: unknown): void; place(h: number, c: number): Promise<void>; select(i: number): void; burnSelected(): Promise<void>; setStepPause(k: number): void };
    };
    w.starweave.tutorial?.stop();
    document.querySelector('.tut-layer')?.remove();
    const sc = w.__scene;
    sc.setGuide(null);
    sc.setStepPause(1);
    const code: Record<string, string> = { s: 'sun', m: 'moon', t: 'star', c: 'comet' };
    const idx = (c: string) => w.starweave.run.night.hand.findIndex((x) => `${x.rank}${x.suit}` === `${c.slice(0, -1)}${code[c.slice(-1)]}`);
    for (const [c, cell] of [['3s', 12], ['3m', 13], ['7t', 14], ['5c', 15]] as const) await sc.place(idx(c), cell);
    sc.select(idx('1m'));
    await sc.burnSelected();
    for (const [c, cell] of [['2t', 0], ['5t', 1], ['8t', 2], ['9s', 7], ['9m', 11], ['4c', 15]] as const) await sc.place(idx(c), cell);
    await sleep(300);
    void sc.place(idx('9t'), 3);
  });
  await page.waitForSelector('.calc.show');
}

for (const lang of ['ru', 'en'] as const) {
  test.describe(`витрина ${lang}`, () => {
    test(`обложки ${lang}`, async ({ browser }) => {
      mkdirSync(`${OUT}/yandex`, { recursive: true });
      mkdirSync(`${OUT}/google-play`, { recursive: true });
      mkdirSync(`${OUT}/telegram`, { recursive: true });
      for (const [w, h, file] of [
        [800, 470, `${OUT}/yandex/cover-800x470-${lang}.png`],
        [1024, 500, `${OUT}/google-play/feature-1024x500-${lang}.png`],
        [640, 360, `${OUT}/telegram/app-640x360-${lang}.png`],
      ] as const) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await page.goto(`/?promo&lang=${lang}`);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: file });
        await page.close();
      }
      copyFileSync('public/icons/icon-512.png', `${OUT}/yandex/icon-512.png`);
    });

    for (const [orient, viewport, scale] of [
      ['portrait', { width: 360, height: 640 }, 3],
      ['landscape', { width: 960, height: 540 }, 2],
    ] as const) {
      test(`скриншоты ${orient} ${lang}`, async ({ browser }) => {
        const dir = `${OUT}/screens/${lang}`;
        mkdirSync(dir, { recursive: true });
        const page = await browser.newPage({ viewport, deviceScaleFactor: scale, isMobile: orient === 'portrait', hasTouch: true });
        const snap = (name: string) => page.screenshot({ path: `${dir}/${orient}-${name}.png` });
        await openGame(page, lang);
        await snap('1-menu');
        await crossMoment(page);
        await page.waitForTimeout(2600);
        await snap('2-cross');
        await page.waitForSelector('.modal-panel.reward', { timeout: 30_000 });
        await page.waitForTimeout(900);
        await page.evaluate(() => {
          const app = (window as unknown as { starweave: { skipTutorial(): void; startRun(s: string): void; run: Record<string, unknown>; collectReward(): void } }).starweave;
          app.skipTutorial();
          app.startRun('classic');
          app.run.gold = 24;
          app.run.phase = 'reward';
          app.run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
          app.run.night = null;
          app.collectReward();
        });
        await page.waitForSelector('.shop');
        await page.waitForTimeout(700);
        await snap('3-shop');
        await page.evaluate(() => (window as unknown as { starweave: { leaveShop(): void } }).starweave.leaveShop());
        await page.waitForSelector('.map');
        await page.waitForTimeout(600);
        await snap('4-map');
        await page.evaluate(() => (window as unknown as { starweave: { startTutorial(): void } }).starweave.startTutorial());
        await page.waitForSelector('.tut-bubble.on');
        await page.waitForTimeout(700);
        await snap('5-tutorial');
        await page.close();
      });
    }
  });
}
