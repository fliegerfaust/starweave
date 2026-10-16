import { expect, test, type Page } from '@playwright/test';

/**
 * Карту несут обратно в руку — она не сгорает: «Сжечь» вплотную под правыми картами руки,
 * и запас зоны сброса ловил возврат (отзыв Дениса, 16.10.2026). На кнопке — сгорает.
 */
type S = { busy: boolean; hand: number[]; night: { burnsLeft: number }; handRect(id: number): R; handAreaRect(): R };
type R = { x: number; y: number; w: number; h: number };

test.beforeEach(({}, info) => {
  test.skip(!['iphone-15', 'pixel-7', 'iphone-se'].includes(info.project.name), 'телефоны: кнопка под рукой');
});

async function night(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave);
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; startRun(s: string): void; beginNight(): void } }).starweave;
    app.profile.tutorialDone = true;
    localStorage.removeItem('starweave.run.v1');
    app.startRun('classic');
    app.beginNight();
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __scene?: S }).__scene;
    return !!s && !s.busy && s.hand.length > 3;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function dragRightCardTo(page: Page, to: (hand: R, burn: DOMRect) => { x: number; y: number }): Promise<number> {
  const g = await page.evaluate(() => {
    const s = (window as unknown as { __scene: S }).__scene;
    const box = document.querySelector('canvas')!.getBoundingClientRect();
    const r = s.handRect(s.hand[s.hand.length - 1]!);
    const hand = s.handAreaRect();
    return { box: { x: box.x, y: box.y }, card: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, hand, burn: document.querySelector('.burn-btn')!.getBoundingClientRect().toJSON() as DOMRect };
  });
  const end = to(g.hand, g.burn);
  await page.mouse.move(g.box.x + g.card.x, g.box.y + g.card.y);
  await page.mouse.down();
  await page.mouse.move(g.box.x + g.card.x, g.box.y + g.card.y - 80, { steps: 6 });
  await page.mouse.move(g.box.x + end.x, g.box.y + end.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.waitForFunction(() => !(window as unknown as { __scene: S }).__scene.busy, null, { timeout: 10_000 });
  return page.evaluate(() => (window as unknown as { __scene: S }).__scene.night.burnsLeft);
}

test('карта, которую вернули в руку над «Сжечь», не сгорает', async ({ page }) => {
  await night(page);
  const before = await page.evaluate(() => (window as unknown as { __scene: S }).__scene.night.burnsLeft);
  // Низ правой карты руки — прямо над кнопкой
  expect(await dragRightCardTo(page, (hand, burn) => ({ x: Math.min(burn.right - 10, hand.x + hand.w - 10), y: hand.y + hand.h - 3 }))).toBe(before);
  // Щель между рукой и кнопкой
  expect(await dragRightCardTo(page, (hand, burn) => ({ x: burn.left + burn.width / 2, y: Math.min(burn.top - 8, hand.y + hand.h + 2) }))).toBe(before);
  // На самой кнопке — сгорает
  expect(await dragRightCardTo(page, (_hand, burn) => ({ x: burn.left + burn.width / 2, y: burn.top + burn.height / 2 }))).toBe(before - 1);
});
