import { expect, test, type Page } from '@playwright/test';

/**
 * Подсказки первых забегов — «Нить» (RD.12): на каждом устройстве показываем подсказки ночи,
 * Обсерватории и карты главы. Плашка на экране, не закрывает цель; цель в рамке, к ней ведёт нить.
 */
test.use({ locale: 'ru-RU' });

type A = {
  profile: Record<string, unknown>;
  run: Record<string, unknown>;
  runs: { startRun(s: string): void; beginNight(): void; collectReward(): void };
  router: { route(): Promise<void> };
};

async function show(page: Page, step: string, setup: 'night' | 'shop' | 'map'): Promise<string[]> {
  await page.evaluate(async ({ step, setup }) => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorial: [], runs: 0, tutorialDone: true, tutorialFinished: false });
    const { coach, clearCoach } = await import('/src/ui/tutorial.ts');
    clearCoach();
    if (setup === 'night' && !document.querySelector('.hud')) {
      a.runs.startRun('classic');
      await new Promise((r) => setTimeout(r, 300));
      a.runs.beginNight();
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (setup === 'shop') {
      Object.assign(a.run, { phase: 'reward', reward: { base: 3, moves: 0, burns: 0, interest: 0, total: 3 }, night: null });
      a.runs.collectReward();
      await new Promise((r) => setTimeout(r, 600));
    }
    if (setup === 'map') {
      Object.assign(a.run, { phase: 'map' });
      (a.run.chapter as { at: number }).at = 2;
      await a.router.route();
      await new Promise((r) => setTimeout(r, 900));
    }
    clearCoach();
    document.querySelectorAll('.toast').forEach((e) => e.remove());
    coach(a as never, step as never);
  }, { step, setup });
  await page.waitForTimeout(700);
  return page.evaluate((step) => {
    const out: string[] = [];
    const c = document.querySelector('.coach')?.getBoundingClientRect();
    const g = document.querySelector('.coach-ring.on')?.getBoundingClientRect();
    if (!c) return [`${step}: нет подсказки`];
    if (c.top < -1 || c.left < -1 || c.right > innerWidth + 1 || c.bottom > innerHeight + 1) out.push(`${step}: подсказка за экраном`);
    if (!g) out.push(`${step}: нет рамки у цели`);
    else if (!(c.right <= g.left || c.left >= g.right || c.bottom <= g.top || c.top >= g.bottom)) out.push(`${step}: подсказка на цели`);
    if (!document.querySelector('.coach-thread path')) out.push(`${step}: нет нити`);
    return out;
  }, step);
}

test('подсказки первых забегов: нить к цели, цель не закрыта', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const failures: string[] = [];
  for (const step of ['place', 'target', 'fillLine', 'combos', 'cross', 'burn']) failures.push(...(await show(page, step, 'night')));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/36-coach-burn.png` });
  failures.push(...(await show(page, 'shop', 'shop')));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/37-coach-shop.png` });
  failures.push(...(await show(page, 'boss', 'map')));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/38-coach-boss.png` });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
