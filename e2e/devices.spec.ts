import { expect, test, type Page } from '@playwright/test';

/**
 * Прогон ключевых экранов на каждом устройстве из playwright.config.ts:
 * меню → ночь → вспышка → Обсерватория → обучение. Проверяем, что ничего не
 * вылезает за экран и не накладывается, нет ошибок, и снимаем скриншоты.
 */

type Rect = { x: number; y: number; w: number; h: number };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e-results/${test.info().project.name}/${name}.png` });

test('экраны помещаются, не накладываются и работают без ошибок', async ({ page }) => {
  const errors = await boot(page);
  await page.waitForTimeout(600);
  await shot(page, '01-menu');

  // Меню: кнопки достаточного размера для пальца
  const small = await page.$$eval('.menu-buttons .btn', (els) => els.filter((e) => e.getBoundingClientRect().height < 40).length);
  expect(small, 'кнопки меню ниже 40px').toBe(0);

  // Ночь
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; startRun(s: string): void } }).starweave;
    app.profile.tutorialDone = true;
    app.startRun('classic');
  });
  await page.waitForSelector('.map');
  await shot(page, '02-map');
  await page.evaluate(() => (window as unknown as { starweave: { beginNight(): void } }).starweave.beginNight());
  await page.waitForFunction(() => !!(window as unknown as { __scene?: { busy: boolean } }).__scene);
  await page.waitForTimeout(2500);
  await shot(page, '03-night');

  const layout = await page.evaluate(() => {
    const scene = (window as unknown as { __scene: { layout: { board: Rect; mode: string }; handAreaRect(): Rect } }).__scene;
    const r = (el: Element | null) => {
      const b = el!.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    return {
      w: window.innerWidth,
      h: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      mode: scene.layout.mode,
      board: scene.layout.board,
      hand: scene.handAreaRect(),
      hud: r(document.querySelector('.hud')),
      actions: r(document.querySelector('.actions')),
    };
  });
  type Rect = { x: number; y: number; w: number; h: number };
  const inside = (r: Rect) => r.x >= -1 && r.y >= -1 && r.x + r.w <= layout.w + 1 && r.y + r.h <= layout.h + 1;
  expect(layout.scrollW, 'горизонтальная прокрутка').toBeLessThanOrEqual(layout.w);
  expect(inside(layout.board), 'небо в пределах экрана').toBe(true);
  expect(inside(layout.hand), 'рука в пределах экрана').toBe(true);
  if (layout.mode === 'portrait') {
    expect(layout.hud.y + layout.hud.h, 'HUD не наезжает на небо').toBeLessThanOrEqual(layout.board.y + 2);
    expect(layout.hand.y + layout.hand.h, 'рука не уходит под кнопки').toBeLessThanOrEqual(layout.actions.y + 30);
  } else {
    expect(layout.hud.x + layout.hud.w, 'HUD слева не наезжает на небо').toBeLessThanOrEqual(layout.board.x + 2);
  }
  expect(layout.board.w / 4, 'карта на небе не мельче 44px').toBeGreaterThanOrEqual(44);

  // Вспышка: ищем ход, который зажигает линию, и снимаем подсчёт
  await page.evaluate(async () => {
    const w = window as unknown as {
      starweave: { run: { night: { hand: unknown[]; grid: unknown[] } } };
      __scene: { busy: boolean; place(h: number, c: number): Promise<void> };
    };
    const { previewPlacement } = await import('/src/game/night/preview.ts');
    const { bestMove } = await import('/src/core/ai/bot.ts');
    for (let k = 0; k < 14; k++) {
      const run = w.starweave.run as never as Parameters<typeof previewPlacement>[0];
      for (let h = 0; h < run.night!.hand.length; h++) {
        for (let c = 0; c < 16; c++) {
          if (run.night!.grid[c]) continue;
          if (previewPlacement(run, h, c)) {
            void w.__scene.place(h, c);
            return;
          }
        }
      }
      const m = bestMove(run, 0)!;
      await w.__scene.place(m.handIndex, m.cell);
    }
  });
  await page.waitForSelector('.calc.show', { timeout: 15_000 });
  await page.waitForTimeout(900);
  await shot(page, '04-scoring');
  await page.waitForFunction(() => !(window as unknown as { __scene: { busy: boolean } }).__scene.busy, null, { timeout: 20_000 });

  // Обсерватория
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { run: Record<string, unknown>; collectReward(): void } }).starweave;
    app.run.phase = 'reward';
    app.run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    app.run.night = null;
    app.collectReward();
  });
  await page.waitForSelector('.shop');
  await page.waitForTimeout(500);
  await shot(page, '05-shop');
  const shopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(shopOverflow, 'горизонтальная прокрутка в магазине').toBeLessThanOrEqual(0);

  // Обучение — первый шаг
  await page.evaluate(() => (window as unknown as { starweave: { startTutorial(): void } }).starweave.startTutorial());
  await page.waitForSelector('.tut-bubble.on', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await shot(page, '06-tutorial');
  const bubble = await page.$eval('.tut-bubble', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  });
  expect(inside(bubble), 'пузырь обучения в пределах экрана').toBe(true);

  expect(errors, 'ошибки в консоли').toEqual([]);
});

test('FPS на замедленном процессоре (×4)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'замедление CPU есть только в Chromium');
  await boot(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; startRun(s: string): void; beginNight(): void } }).starweave;
    app.profile.tutorialDone = true;
    app.startRun('classic');
    app.beginNight();
  });
  await page.waitForTimeout(3000);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else resolve(frames / 3);
        };
        requestAnimationFrame(tick);
      }),
  );
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) });
  console.log(`[${test.info().project.name}] FPS при CPU ×4: ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(30);
});
