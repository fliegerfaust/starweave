import { expect, test, type Page } from '@playwright/test';

/**
 * Системная кнопка «Назад» на Android (APK.3): одно нажатие, один шаг на каждом экране. Здесь
 * вызывается та же функция, что и на телефоне; на устройстве проверены ночь и главный экран.
 */
test.skip(({ isMobile }) => isMobile, 'логика одна, достаточно одного экрана');

type Win = Window & { starweave: { router: { screen: { constructor: { name: string } } | null; goAtlas(from: string): Promise<void>; goArchive(): Promise<void> } } };

const back = (page: Page) =>
  page.evaluate(async () => {
    const { handleBack } = await import('/src/game/back.ts');
    handleBack((window as unknown as { starweave: never }).starweave);
    await new Promise((r) => setTimeout(r, 400));
  });
const windows = (page: Page) => page.locator('.modal-panel').count();
const screen = (page: Page) => page.evaluate(() => (window as unknown as Win).starweave.router.screen?.constructor.name);

test('Назад в Обсерватории открывает меню забега, второй раз закрывает', async ({ page }) => {
  await page.goto('/?at=shop&lang=ru');
  await page.waitForFunction(() => (window as unknown as Win).starweave?.router.screen?.constructor.name === 'ShopScreen', null, { timeout: 30_000 });
  await back(page);
  expect(await windows(page)).toBe(1);
  await back(page);
  expect(await windows(page)).toBe(0);
  expect(await screen(page)).toBe('ShopScreen');
});

test('Назад на карте неба не уводит с неё и не открывает окон', async ({ page }) => {
  await page.goto('/?skymap&lang=ru');
  await page.waitForFunction(() => (window as unknown as Win).starweave?.router.screen?.constructor.name === 'MapScreen', null, { timeout: 30_000 });
  await back(page);
  await expect.poll(() => screen(page)).toBe('MapScreen');
  expect(await windows(page)).toBe(0);
});

test('Назад из атласа и архива ведёт в меню, в меню спрашивает о выходе', async ({ page }) => {
  await page.goto('/?at=shop&lang=ru');
  await page.waitForFunction(() => (window as unknown as Win).starweave?.router.screen?.constructor.name === 'ShopScreen', null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as Win).starweave.router.goAtlas('test'));
  await expect.poll(() => screen(page)).toBe('AtlasScreen');
  await back(page);
  await expect.poll(() => screen(page)).toBe('MenuScreen');

  await page.evaluate(() => (window as unknown as Win).starweave.router.goArchive());
  await expect.poll(() => screen(page)).toBe('ArchiveScreen');
  await back(page);
  await expect.poll(() => screen(page)).toBe('MenuScreen');

  await back(page);
  await expect(page.locator('.modal-panel')).toContainText(/Выйти из игры|Quit the game/);
  await back(page);
  expect(await windows(page)).toBe(0);
});
