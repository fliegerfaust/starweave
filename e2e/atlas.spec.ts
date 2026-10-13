import { devices, expect, test, type Page } from '@playwright/test';

/**
 * Атлас и архив: помещаются по ширине, кнопки под палец, без ошибок; тестовая покупка.
 * Снимки — по-русски и после всех анимаций, со всеми состояниями оплаты.
 */
test.use({ locale: 'ru-RU' });

type W = {
  starweave: {
    goAtlas(from: string, focus?: string): Promise<void>;
    goArchive(): Promise<void>;
    purchases: { has(id: string): boolean; add(id: string): void };
    profile: { archive?: Record<string, { ante: number; best: number; won?: boolean }> };
  };
};

async function boot(page: Page, query = '?fakepay'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  await page.goto('/' + query);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

/** Снимок после всех анимаций (проявление экрана, табличка, тост). */
const settle = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 8000 });

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/${name}.png` });
}

async function fits(page: Page, root: string): Promise<void> {
  await settle(page);
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

const openAtlas = async (page: Page) => {
  await page.evaluate(() => (window as unknown as W).starweave.goAtlas('e2e'));
  await page.waitForSelector('.atlas-chart');
};

test('атлас: созвездие, покупка, примерочная', async ({ page }) => {
  const errors = await boot(page);
  // Цена «грузится»: задерживаем ответ площадки
  await page.evaluate(() => {
    const p = (window as unknown as { starweave: { platform: { payments: { prices(): Promise<Record<string, string>> } } } }).starweave.platform.payments;
    const orig = p.prices.bind(p);
    p.prices = () => new Promise((r) => setTimeout(() => r(orig()), 4000));
  });
  await openAtlas(page);
  await shot(page, '19-atlas-loading');
  await expect(page.locator('.offer-buy .btn-sub')).toHaveText('…');
  await expect(page.locator('.offer-buy')).not.toHaveText(/…$/, { timeout: 8000 });
  await fits(page, '.atlas');
  await shot(page, '20-atlas');

  await page.click('.atlas-star:has-text("Астролябия")');
  await expect(page.locator('.atlas-plate')).toHaveAttribute('data-star', 'astrolabe');
  await page.click('.offer-buy');
  await page.waitForSelector('[data-r="paid"]');
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-r]')!.parentElement!.parentElement!.style.setProperty('visibility', 'hidden'));
  await expect(page.locator('.offer-buy')).toBeDisabled();
  await shot(page, '20b-atlas-busy');
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-r]')!.parentElement!.parentElement!.style.removeProperty('visibility'));
  await page.click('[data-r="paid"]');
  await page.waitForSelector('.offer-owned');
  expect(await page.evaluate(() => (window as unknown as W).starweave.purchases.has('atlas'))).toBe(true);
  // Тост исчезает через ~2 с
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 5000 });
  await expect(page.locator('.plate-actions .btn')).toHaveText(/Играть колодой/);
  await shot(page, '21-atlas-owned');
  expect(errors).toEqual([]);
});

test('атлас на обычном сайте без покупок', async ({ page }) => {
  const errors = await boot(page, '');
  await openAtlas(page);
  await expect(page.locator('.offer-note')).toBeVisible();
  await fits(page, '.atlas');
  await shot(page, '23-atlas-web');
  expect(errors).toEqual([]);
});

test('архив: календарь без атласа и у владельца', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as W).starweave.goArchive());
  await page.waitForSelector('.archive-grid');
  await fits(page, '.archive');
  await expect(page.locator('.archive-locked')).toBeVisible();
  await shot(page, '22-archive');
  await page.evaluate(() => {
    const app = (window as unknown as W).starweave;
    app.purchases.add('atlas');
    app.profile.archive = { '2026-10-03': { ante: 4, best: 812 }, '2026-10-05': { ante: 8, best: 2400, won: true }, '2026-10-01': { ante: 2, best: 120 } };
    return app.goArchive();
  });
  await page.waitForSelector('.archive-play');
  await page.click('.archive-day.played >> nth=0');
  await expect(page.locator('.archive-play')).toHaveText(/Сыграть ещё раз/);
  await shot(page, '22b-archive-owned');
  expect(errors).toEqual([]);
});
