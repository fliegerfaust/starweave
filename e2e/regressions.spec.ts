import { expect, test } from '@playwright/test';

/**
 * Ошибки, пойманные у игроков (js_error в сводке), — чтобы не вернулись.
 * Одного устройства достаточно: дело в логике, а не в вёрстке.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'одного устройства достаточно');
});

// 14.10.2026, Telegram, 0.4.4: «null is not an object (evaluating 'e.phase')» через 2 с после
// конца обучения. Окно награды второй учебной ночи оставалось под «Обучение пройдено», его
// «Забрать» вела в забег, которого уже нет (у новичка сохранения нет — run = null).
test('конец обучения поверх окна награды не ломает игру', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave);
  const result = await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    type AppLike = {
      run: { phase: string; reward: unknown } | null;
      runs: {
        tutorial: { stop(): void; emit(e: unknown): void } | null;
        startTutorial(): void;
        finishTutorial(): void;
        collectReward(): void;
        leaveShop(): void;
        beginNight(): void;
      };
      router: { screen: { showReward(): void } };
    };
    const app = (window as unknown as { starweave: AppLike }).starweave;
    localStorage.removeItem('starweave.run.v1');
    app.runs.startTutorial();
    await sleep(1200);
    app.runs.tutorial?.stop();
    app.runs.tutorial = { stop() {}, emit() {} };
    app.run!.phase = 'reward';
    app.run!.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    app.router.screen.showReward();
    await sleep(300);
    app.runs.finishTutorial();
    await sleep(500);
    const titles = [...document.querySelectorAll('.modal-backdrop .modal-panel')].map((p) => (p as HTMLElement).innerText.split('\n').find((l) => l.trim()) ?? '');
    // Всё, что может нажать игрок, пока висит «Обучение пройдено»
    app.runs.collectReward();
    app.runs.leaveShop();
    app.runs.beginNight();
    return { runIsNull: app.run === null, modals: titles.length };
  });
  expect(result.runIsNull).toBe(true);
  expect(result.modals, 'остаётся только «Обучение пройдено»').toBe(1);
  expect(errors).toEqual([]);
});

// 14.10.2026, 0.4.10: «У сущности N нет Transform» — 155 раз. Карту держали пальцем, а сожгли
// её в обход перетаскивания (второй палец по «Сжечь», клавиша B); каждое движение пальца
// обращалось к удалённой сущности.
test('сжечь карту, которую держишь, — без ошибок', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave);
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; runs: { startRun(s: string): void; beginNight(): void } } }).starweave;
    app.profile.tutorialDone = true;
    localStorage.removeItem('starweave.run.v1');
    app.runs.startRun('classic');
    app.runs.beginNight();
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __scene?: { busy: boolean; hand: number[] } }).__scene;
    return !!s && !s.busy && s.hand.length > 0;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const s = (window as unknown as { __scene: { hand: number[]; handRect(id: number): { x: number; y: number; w: number; h: number } } }).__scene;
    const r = s.handRect(s.hand[0]!);
    const box = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: box.x + r.x + r.w / 2, y: box.y + r.y + r.h / 2 };
  });
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  await page.mouse.move(card.x - 60, card.y - 40, { steps: 5 });
  await page.keyboard.press('b');
  await page.waitForFunction(() => !(window as unknown as { __scene: { busy: boolean } }).__scene.busy, null, { timeout: 10_000 });
  await page.mouse.move(card.x - 160, card.y - 120, { steps: 10 });
  await page.mouse.up();
  expect(errors).toEqual([]);
});

// Та же ошибка с мышью: отпускание кнопки потерялось, карта ехала за курсором без нажатия,
// игрок нажимал «Сжечь» — дальше каждое движение мыши падало. Движение без зажатой кнопки
// теперь заканчивает перетаскивание.
test('потерянное отпускание мыши не оставляет карту «в руке»', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave);
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; runs: { startRun(s: string): void; beginNight(): void } } }).starweave;
    app.profile.tutorialDone = true;
    localStorage.removeItem('starweave.run.v1');
    app.runs.startRun('classic');
    app.runs.beginNight();
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __scene?: { busy: boolean; hand: number[] } }).__scene;
    return !!s && !s.busy && s.hand.length > 0;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const s = (window as unknown as { __scene: { hand: number[]; handRect(id: number): { x: number; y: number; w: number; h: number } } }).__scene;
    const r = s.handRect(s.hand[0]!);
    const box = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: box.x + r.x + r.w / 2, y: box.y + r.y + r.h / 2 };
  });
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  await page.mouse.move(card.x - 60, card.y - 40, { steps: 5 });
  // Кнопку отпустили, а pointerup не пришёл: следующее движение — уже без кнопки
  const dragAfter = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, buttons: 0, bubbles: true }));
    return (window as unknown as { __scene: { drag: unknown } }).__scene.drag;
  }, { x: card.x - 90, y: card.y - 60 });
  expect(dragAfter, 'перетаскивание закончилось').toBeNull();
  await page.mouse.up();
  await page.locator('.burn-btn').click();
  await page.waitForFunction(() => !(window as unknown as { __scene: { busy: boolean } }).__scene.busy, null, { timeout: 10_000 });
  await page.mouse.move(card.x - 200, card.y - 150, { steps: 10 });
  expect(errors).toEqual([]);
});
