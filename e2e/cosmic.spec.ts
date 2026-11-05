import { expect, test } from '@playwright/test';

/** Удар и Затмение на шейдерах: ход доходит до конца и со слоем, и там, где WebGL2 нет. */
for (const stage of ['warLine', 'warHole', 'warEclipse', 'warEclipseWin']) {
  test(`космический удар: ${stage}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?demo=${stage}&impact=cosmos&ff=all&lang=ru`);
    await page.waitForFunction(() => 'impactPlay' in window || '__impactPlay' in window, null, { timeout: 30_000 });
    await page.evaluate(() => (window as unknown as { __impactPlay(): Promise<void> }).__impactPlay());
    expect(await page.evaluate(() => (window as unknown as { __scene: { busy: boolean } }).__scene.busy)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('приход Затмения отпускает поле', async ({ page }) => {
  await page.goto('/?demo=warArrive&impact=cosmos&ff=all&lang=ru');
  await page.waitForFunction(() => 'impactPlay' in window || '__impactPlay' in window || (window as unknown as { __scene?: unknown }).__scene, null, { timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as { __scene: { busy: boolean } }).__scene.busy === false, null, { timeout: 30_000 });
});
