import { expect, test, type Page } from '@playwright/test';

/** Атлас и архив: помещаются по ширине, кнопки под палец, без ошибок; тестовая покупка. */

type W = { starweave: { goAtlas(from: string, focus?: string): Promise<void>; goArchive(): Promise<void>; purchases: { has(id: string): boolean } } };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  await page.goto('/?fakepay');
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e-results/${test.info().project.name}/${name}.png` });

async function fits(page: Page, root: string): Promise<void> {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const tooSmall = [...el.querySelectorAll('button')].filter((b) => {
      const box = b.getBoundingClientRect();
      return box.width > 0 && box.height < 30 && !b.classList.contains('link-btn');
    }).length;
    return { scrollW: el.scrollWidth, w: el.clientWidth, tooSmall };
  }, root);
  expect(r.scrollW, `${root}: горизонтальная прокрутка`).toBeLessThanOrEqual(r.w + 1);
  expect(r.tooSmall, `${root}: кнопки ниже 30px`).toBe(0);
}

test('атлас: созвездие, покупка, примерочная', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as W).starweave.goAtlas('e2e'));
  await page.waitForSelector('.atlas-chart');
  await page.waitForTimeout(1800);
  await fits(page, '.atlas');
  await shot(page, '20-atlas');
  await page.click('.atlas-star:has-text("Астролябия"), .atlas-star:has-text("Astrolabe")');
  await expect(page.locator('.atlas-plate')).toHaveAttribute('data-star', 'astrolabe');
  await page.click('.offer-buy');
  await page.click('[data-r="paid"]');
  await page.waitForSelector('.offer-owned');
  expect(await page.evaluate(() => (window as unknown as W).starweave.purchases.has('atlas'))).toBe(true);
  await shot(page, '21-atlas-owned');
  expect(errors).toEqual([]);
});

test('архив: календарь и запуск прошедшего дня', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as W).starweave.goArchive());
  await page.waitForSelector('.archive-grid');
  await fits(page, '.archive');
  await shot(page, '22-archive');
  expect(errors).toEqual([]);
});
