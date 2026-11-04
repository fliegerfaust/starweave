import { expect, test } from '@playwright/test';

/**
 * FX.12 (CG-205): смена размера окна на сцене трофея. Ночи в забеге уже нет, небо ещё на экране:
 * раньше раскладка падала на `night.rules`, а поле и кнопка сцены оставались на старых местах.
 * DEV-вход `?trophy`: Затмение выиграно, «Забрать» открывает сцену.
 */
const SIZES = [
  { width: 384, height: 832 },
  { width: 832, height: 384 },
  { width: 384, height: 700 },
  { width: 1366, height: 768 },
];

test('Сцена трофея переживает смену размера: без ошибок, выбор и кнопка на экране', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(SIZES[0]!);
  await page.goto('/?trophy');
  await page.locator('.scene-window .btn, .scene .btn').first().click();
  await page.waitForSelector('.ts-card[data-k="trophy"]');
  await page.waitForTimeout(3500);

  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    expect(errors, `ошибки при ${size.width}×${size.height}`).toEqual([]);
    for (const sel of ['.ts-card[data-k="trophy"]', '.ts-card[data-k="omen"]', '.ts-go']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box, `${sel} при ${size.width}×${size.height}`).not.toBeNull();
      expect(box.x, `${sel} слева при ${size.width}×${size.height}`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${sel} сверху при ${size.width}×${size.height}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${sel} справа при ${size.width}×${size.height}`).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, `${sel} снизу при ${size.width}×${size.height}`).toBeLessThanOrEqual(size.height);
    }
  }

  await page.locator('.ts-card[data-k="trophy"]').click();
  await page.locator('.ts-go').click();
  await page.waitForSelector('.shop', { timeout: 8000 });
  expect(errors).toEqual([]);
});
