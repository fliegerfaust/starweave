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
      tutorial: { stop(): void; emit(e: unknown): void } | null;
      screen: { showReward(): void };
      startTutorial(): void;
      finishTutorial(): void;
      collectReward(): void;
      leaveShop(): void;
      beginNight(): void;
    };
    const app = (window as unknown as { starweave: AppLike }).starweave;
    localStorage.removeItem('starweave.run.v1');
    app.startTutorial();
    await sleep(1200);
    app.tutorial?.stop();
    app.tutorial = { stop() {}, emit() {} };
    app.run!.phase = 'reward';
    app.run!.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    app.screen.showReward();
    await sleep(300);
    app.finishTutorial();
    await sleep(500);
    const titles = [...document.querySelectorAll('.modal-backdrop .modal-panel')].map((p) => (p as HTMLElement).innerText.split('\n').find((l) => l.trim()) ?? '');
    // Всё, что может нажать игрок, пока висит «Обучение пройдено»
    app.collectReward();
    app.leaveShop();
    app.beginNight();
    return { runIsNull: app.run === null, modals: titles.length };
  });
  expect(result.runIsNull).toBe(true);
  expect(result.modals, 'остаётся только «Обучение пройдено»').toBe(1);
  expect(errors).toEqual([]);
});
