import { expect, test } from '@playwright/test';

/**
 * Холст поверх интерфейса (APK.10): пустой прозрачный слой на весь экран каждый кадр сводился
 * со страницей и съедал кадры на слабом телефоне. Теперь он скрыт, пока на нём нечего рисовать,
 * а надпись подсчёта показывает его сразу и исчезает вместе с ним.
 */
test('холст поверх интерфейса виден только пока на нём рисуют', async ({ page }) => {
  await page.goto('/?demo&lang=ru');
  await page.waitForFunction(() => 'starweave' in window, null, { timeout: 30_000 });
  const state = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.fx-overlay')!;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let painted = false;
      for (let i = 3; i < data.length && !painted; i += 4) painted = data[i]! > 8;
      return { visibility: getComputedStyle(c).visibility, painted };
    });

  await expect.poll(state, { timeout: 10_000 }).toEqual({ visibility: 'hidden', painted: false });
  await page.evaluate(async () => {
    const { floatText } = await import('/src/game/fx.ts');
    const app = (window as unknown as { starweave: { svc: { world: never } } }).starweave;
    floatText(app.svc.world, 120, 200, '+12', { life: 3 });
  });
  await expect.poll(state, { timeout: 2_000 }).toEqual({ visibility: 'visible', painted: true });
  await expect.poll(state, { timeout: 10_000 }).toEqual({ visibility: 'hidden', painted: false });
});
