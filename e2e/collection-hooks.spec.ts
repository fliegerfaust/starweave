import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Крючки в Коллекцию (CL.3). Строка «Новое в Коллекции» в итогах поражения и победы: на экране
 * без прокрутки, ничего не вылезает, касание открывает Коллекцию, после неё итоги на месте.
 */
test.use({ locale: 'ru-RU' });

for (const over of ['lost', 'win'] as const) {
  test(`итоги ${over}: строка находок ведёт в Коллекцию`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?over=${over}${over === 'win' ? '&finds=6' : ''}`);
    const row = page.locator('.over-finds');
    await expect(row).toBeVisible();
    await page.waitForTimeout(800);
    await expect(row.locator('.of-label b')).toHaveText(over === 'win' ? '6' : '3');
    const marks = over === 'win' ? ((page.viewportSize()!.width < 360) ? 3 : 4) : 3;
    await expect(row.locator('.of-mark')).toHaveCount(marks);
    if (over === 'win') await expect(row.locator('.of-more')).toHaveText(`+${6 - marks}`);

    const box = (await row.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width - 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas'));
    expect(audit).toEqual([]);

    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(page.locator('.collection-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.collection-modal')).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(errors).toEqual([]);
  });
}
