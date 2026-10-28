import { expect, test, type Page } from '@playwright/test';

/**
 * Ключевые слова (KW, отзыв Андрея 28.10): «миф» и «проценты» в описаниях Знамений нажимаются и
 * объясняются, у выбранной карты с небесным телом под небом есть строка правила, как у глифа,
 * и она помещается в одну строку на любом экране.
 */
type App = { profile: Record<string, unknown>; run: Record<string, unknown> & { shop: { items: unknown[] }; night: { hand: Record<string, unknown>[] } }; runs: { startRun(s: string, daily?: boolean, stake?: number, seed?: number): void; beginNight(node?: number): void }; router: { route(): Promise<void> } };

async function boot(page: Page, lang: 'ru' | 'en'): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async (lang) => {
    const { setLang } = await import('/src/i18n/index.ts');
    setLang(lang);
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const app = (window as unknown as { starweave: App }).starweave;
    app.profile.tutorialDone = true;
    app.profile.runs = 12;
    app.runs.startRun('classic', false, 0, 4242);
  }, lang);
  await page.waitForTimeout(300);
}

for (const lang of ['ru', 'en'] as const) {
  test(`Обсерватория: «миф» и «проценты» объясняются касанием (${lang})`, async ({ page }) => {
    await boot(page, lang);
    await page.evaluate(async () => {
      const { generateShop } = await import('/src/core/shop.ts');
      const app = (window as unknown as { starweave: App }).starweave;
      const run = app.run as never as { phase: string; shop: { items: unknown[] }; ante: number };
      run.ante = 3;
      run.phase = 'shop';
      run.shop = generateShop(run as never) as never;
      run.shop.items[0] = { kind: 'omen', omenId: 'astrologer', price: 7, sold: false };
      run.shop.items[1] = { kind: 'omen', omenId: 'miser', price: 5, sold: false };
      await app.router.route();
    });
    await page.waitForTimeout(900);
    for (const key of ['myth', 'interest']) {
      const words = page.locator(`.kw[data-kw="${key}"]`);
      expect(await words.count(), key).toBeGreaterThan(0);
      await words.first().scrollIntoViewIfNeeded();
      await words.first().click();
      const hint = page.locator('.kw-hint');
      await expect(hint).toBeVisible();
      expect((await hint.innerText()).length).toBeGreaterThan(40);
      await page.mouse.click(5, 5);
    }
    // У Астролога оба «мифа» — и в приглушённом условии, и в результате
    expect(await page.locator('.kw[data-kw="myth"]').count()).toBe(2);
  });

  test(`Ночь: правило небесного тела у выбранной карты (${lang})`, async ({ page }) => {
    await boot(page, lang);
    await page.evaluate(() => (window as unknown as { starweave: App }).starweave.runs.beginNight(0));
    await page.waitForFunction(() => (window as unknown as { starweave: App }).starweave.run.phase === 'night');
    await page.waitForTimeout(2500);
    for (const glyph of ['gilded', 'blazing', 'radiant', 'echo', 'glass', 'prism']) {
      const fits = await page.evaluate((glyph) => {
        const app = (window as unknown as { starweave: App }).starweave;
        const hud = document.querySelector('.card-info') as HTMLElement;
        (app as unknown as { router: { screen?: { hud?: { setCardInfo(c: unknown): void } } } }).router.screen?.hud?.setCardInfo({ ...app.run.night.hand[0]!, body: undefined, glyph });
        return hud.scrollWidth <= hud.clientWidth + 1 ? '' : `${hud.scrollWidth}/${hud.clientWidth} ${hud.innerText}`;
      }, glyph);
      expect(fits, glyph).toBe('');
    }
    for (const body of ['polaris', 'meteor', 'pulsar', 'twin', 'nebula', 'blackhole']) {
      const info = await page.evaluate(async (body) => {
        const { dict } = await import('/src/i18n/index.ts');
        const app = (window as unknown as { starweave: App }).starweave;
        const card = { ...app.run.night.hand[0]!, body, glyph: undefined };
        // Подпись под небом — та же, что при касании карты в руке
        const hud = document.querySelector('.card-info') as HTMLElement;
        const screen = (app as unknown as { router: { screen?: { hud?: { setCardInfo(c: unknown): void } } } }).router.screen;
        screen?.hud?.setCardInfo(card);
        await new Promise((r) => setTimeout(r, 50));
        return { text: hud.innerText.replace(/\u00a0/g, ' '), fits: hud.scrollWidth <= hud.clientWidth + 1, sw: `${hud.scrollWidth}/${hud.clientWidth}`, clickable: hud.classList.contains('clickable'), short: (dict() as unknown as { bodyShort: Record<string, string> }).bodyShort[body] };
      }, body);
      expect(info.text, body).toContain(info.short);
      expect(info.text, body).toContain('ⓘ');
      expect(info.clickable, body).toBe(true);
      expect(info.fits, `${body} ${info.sw}: ${info.text}`).toBe(true);
    }
  });
}

test('Ночь: подпись тела в одну строку и не выходит за экран', async ({ page }) => {
  await boot(page, 'ru');
  await page.evaluate(() => (window as unknown as { starweave: App }).starweave.runs.beginNight(0));
  await page.waitForFunction(() => (window as unknown as { starweave: App }).starweave.run.phase === 'night');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: App }).starweave;
    const screen = (app as unknown as { router: { screen?: { hud?: { setCardInfo(c: unknown): void } } } }).router.screen;
    screen?.hud?.setCardInfo({ ...app.run.night.hand[0]!, body: 'polaris' });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e-results/card-info-${test.info().project.name}.png` });
  const box = await page.locator('.card-info').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
});
