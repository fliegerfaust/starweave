import { expect, test, type Page } from '@playwright/test';

/**
 * Цель забега на виду — «Пролог пути» (GO.5): в шапке карты главы путь из восьми Затмений и
 * рассвета; один раз в первых забегах перед первой картой главы — окно с дугой пути и Лебедем,
 * «В путь» его закрывает. Окно и кнопка в экране на любом устройстве, второй раз не показывается.
 */
test.use({ locale: 'ru-RU' });

type A = {
  profile: Record<string, unknown> & { tutorial: string[] };
  run: Record<string, unknown>;
  runs: { startRun(s: string): void };
  router: { route(): Promise<void> };
};

/** Новичок на первой карте главы. */
async function firstMap(page: Page, seen: boolean): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async (seen) => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorial: seen ? ['runPath'] : [], runs: 0, tutorialDone: true, tutorialFinished: false });
    a.runs.startRun('classic');
    await new Promise((r) => setTimeout(r, 300));
    // Забег начинается с карты главы; если нет — открываем её (повторный показ закрыл бы пролог)
    if (!document.querySelector('.map')) {
      a.run.phase = 'map';
      await a.router.route();
    }
  }, seen);
  await page.waitForSelector('.map');
}

const inside = (r: { x: number; y: number; width: number; height: number } | null, vw: number, vh: number) =>
  !!r && r.x >= -1 && r.y >= -1 && r.x + r.width <= vw + 1 && r.y + r.height <= vh + 1;

test('пролог пути: один раз, в экране, «В путь» закрывает; в шапке путь до рассвета (GO.5)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await firstMap(page, false);
  await page.waitForSelector('.run-prologue', { timeout: 10_000 });
  await page.waitForTimeout(400);
  const vp = page.viewportSize()!;
  const go = page.locator('.run-prologue-acts .btn');
  expect(inside(await go.boundingBox(), vp.width, vp.height), '«В путь» в экране').toBe(true);
  expect(inside(await page.locator('.modal-panel.run-prologue').boundingBox(), vp.width, vp.height), 'окно в экране').toBe(true);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/40-run-prologue.png` });
  await go.click();
  await page.waitForFunction(() => !document.querySelector('.run-prologue'));
  // Путь в шапке: восемь глав и рассвет, текущая — первая
  expect(await page.locator('.map-run i').count()).toBe(8);
  expect(await page.locator('.map-run i.now').count()).toBe(1);
  expect(await page.locator('.map-run .dawn').count()).toBe(1);
  const marked = await page.evaluate(() => (window as unknown as { starweave: A }).starweave.profile.tutorial.includes('runPath'));
  expect(marked, 'пролог отмечен как показанный').toBe(true);
  expect(errors).toEqual([]);
});

test('пролог пути не повторяется (GO.5)', async ({ page }) => {
  await firstMap(page, true);
  await page.waitForTimeout(800);
  expect(await page.locator('.run-prologue').count()).toBe(0);
  expect(await page.locator('.map-run i').count()).toBe(8);
});
