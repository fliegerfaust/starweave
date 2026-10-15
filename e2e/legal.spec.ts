import { expect, test } from '@playwright/test';

/**
 * Юридические тексты — «Табличка» (RD.11). Страница на Pages: язык переключателем, разделы с
 * номером, шрифты свои (ни одного запроса к сторонним сайтам), без горизонтальной прокрутки.
 * Окно в игре: целиком на экране, текст прокручивается внутри, «Назад» по своей ширине.
 */
test.use({ locale: 'ru-RU' });

test('юридические страницы и окно в игре', async ({ page }) => {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) foreign.push(r.url());
  });
  for (const doc of ['privacy', 'terms']) {
    await page.goto(`/legal/${doc}.html`);
    await expect(page.locator('section#ru')).toBeVisible();
    await expect(page.locator('section#en')).toBeHidden();
    expect(await page.locator('#ru .doc h2 .n').count()).toBeGreaterThan(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'без горизонтальной прокрутки').toBe(true);
    await page.screenshot({ path: `e2e-results/${test.info().project.name}/40-legal-${doc}.png` });
    await page.locator('#ru .langs a[data-lang="en"]').click();
    await expect(page.locator('section#en')).toBeVisible();
    await expect(page.locator('section#ru')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(foreign, 'шрифты и всё прочее — со своего сайта').toEqual([]);

  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async () => {
    const { showLegal } = await import('/src/ui/screens/legal.ts');
    showLegal('privacy');
  });
  await page.waitForSelector('.legal-win .legal-doc h2 .n');
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const p = document.querySelector('.modal-panel.legal-win')!.getBoundingClientRect();
    const sc = document.querySelector('.legal-scroll')!;
    const btn = document.querySelector('.legal-foot .btn')!.getBoundingClientRect();
    return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, vw: innerWidth, vh: innerHeight, scrolls: sc.scrollHeight > sc.clientHeight, btn: btn.width, btnBottom: btn.bottom, links: document.querySelectorAll('.legal-doc a').length };
  });
  expect(m.left).toBeGreaterThanOrEqual(0);
  expect(m.right).toBeLessThanOrEqual(m.vw);
  expect(m.bottom).toBeLessThanOrEqual(m.vh);
  expect(m.btnBottom, '«Назад» на экране').toBeLessThanOrEqual(m.vh);
  expect(m.scrolls, 'текст прокручивается внутри окна').toBe(true);
  expect(m.btn, '«Назад» не растянута').toBeLessThan(300);
  expect(m.links, 'в игре ссылки — текстом').toBe(0);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/41-legal-game.png` });
  expect(errors).toEqual([]);
});
