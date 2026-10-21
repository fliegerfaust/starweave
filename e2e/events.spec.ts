import { expect, test } from '@playwright/test';

/**
 * Игра шлёт события на свой сервер (VITE_EVENTS_URL): пачка text/plain с JSON в формате,
 * который принимает server/src/validate.ts. Запускается, когда адрес задан при сборке.
 */
test('события уходят на свой сервер', async ({ page }) => {
  const url = process.env.VITE_EVENTS_URL;
  test.skip(!url || test.info().project.name !== 'desktop', 'нужен VITE_EVENTS_URL; одного устройства достаточно');
  const bodies: string[] = [];
  await page.route(url!, async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  // Свернули вкладку — пачка уходит сразу, не дожидаясь таймера
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  const batch = JSON.parse(bodies[0]!) as { c: string; s: string; p: string; v: string; l: string; n: number; e: [string, object, number][] };
  expect(batch.c).toMatch(/^[a-z0-9-]{8,64}$/);
  expect(batch.p).toBe('web');
  expect(batch.e.map(([name]) => name)).toContain('app_open');
});
