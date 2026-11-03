import { expect, test, type Page } from '@playwright/test';

/**
 * Первый заход в Обсерваторию — «Проводник» (GL.7): Лебедь ведёт по экрану в четыре шага,
 * экран приглушён, нажимается только то, о чём речь. Окна поверх Обсерватории важнее: проводник
 * ждёт их и прячется под ними (как «Нить» в GL.6).
 */
test.use({ locale: 'ru-RU' });

type A = {
  profile: Record<string, unknown> & { tutorial: string[] };
  run: Record<string, unknown> & { omens: unknown[] };
  runs: { startRun(s: string): void; beginNight(): void; collectReward(): void };
};

/** Новичок после первой ночи: забег начат, итоги забраны — открывается Обсерватория. */
async function firstVisit(page: Page, gold: number): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async (gold) => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorial: [], runs: 0, tutorialDone: true, tutorialFinished: false });
    a.runs.startRun('classic');
    await new Promise((r) => setTimeout(r, 300));
    Object.assign(a.run, { gold, phase: 'reward', reward: { base: 0, moves: 0, burns: 0, interest: 0, total: 0 }, night: null });
    a.runs.collectReward();
  }, gold);
  await page.waitForSelector('.shop');
}

const bubble = (page: Page, text: string) =>
  page.waitForFunction((text) => !!document.querySelector('.tut-bubble.on .mentor-say')?.textContent?.includes(text), text, { timeout: 15_000 });

/** Подсказка на экране и не закрывает то, о чём говорит. */
async function placed(page: Page): Promise<string[]> {
  // Рамка доезжает до новой цели за 0,3 с — меряем, когда встала
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const out: string[] = [];
    const b = document.querySelector('.tut-bubble.on')?.getBoundingClientRect();
    const s = document.querySelector('.tut-spot.on')?.getBoundingClientRect();
    if (!b) return ['нет подсказки'];
    if (b.top < -1 || b.left < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push('подсказка за экраном');
    if (!s) out.push('нет рамки');
    else if (!(b.right <= s.left + 2 || b.left >= s.right - 2 || b.bottom <= s.top + 2 || b.top >= s.bottom - 2)) out.push(`подсказка на цели: ${document.querySelector('.tut-bubble.on')?.textContent?.slice(6, 40)} b=${Math.round(b.top)}-${Math.round(b.bottom)} s=${Math.round(s.top)}-${Math.round(s.bottom)} vh=${innerHeight}`);
    return out;
  });
}

test('первый заход: Лебедь ведёт в четыре шага, нажимается только предмет речи (GL.7)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await firstVisit(page, 30);
  const failures: string[] = [];
  await bubble(page, 'Купи одно');
  failures.push(...(await placed(page)));
  // Заперто всё, кроме цен Знамений: «Обновить» не нажимается
  const locked = await page.evaluate(() => getComputedStyle(document.querySelector('.shop-actions .reroll')!).pointerEvents);
  expect(locked, '«Обновить» заперто').toBe('none');
  await page.locator('[data-shop="omens"] .btn.price.tut-allow').first().click();
  await bubble(page, 'слева направо');
  failures.push(...(await placed(page)));
  await page.locator('.tut-next').click();
  await bubble(page, 'прокачивает созвездие');
  failures.push(...(await placed(page)));
  await page.locator('.tut-next').click();
  await bubble(page, 'Следующая ночь');
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/39-first-shop.png` });
  expect(await page.locator('[data-shop="next"].tut-allow').count(), '«Следующая ночь» открыта').toBe(1);
  const state = await page.evaluate(() => {
    const a = (window as unknown as { starweave: A }).starweave;
    return { omens: a.run.omens.length, marked: a.profile.tutorial.includes('shop') };
  });
  expect(state).toEqual({ omens: 1, marked: true });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('первый заход без золота на Знамение: Лебедь рассказывает и ведёт дальше (GL.7)', async ({ page }) => {
  await firstVisit(page, 0);
  await bubble(page, 'копи золото');
  await page.locator('.tut-next').click();
  await bubble(page, 'прокачивает созвездие');
  await page.locator('.tut-next').click();
  await bubble(page, 'Следующая ночь');
});

test('первый заход ждёт окна: под окном проводника нет, после — есть (GL.6, GL.7)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const log = await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorial: [], runs: 0, tutorialDone: true, tutorialFinished: false });
    const { modal } = await import('/src/ui/widgets.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const shown = () => {
      const layer = document.querySelector<HTMLElement>('.tut-layer');
      return !!layer && layer.style.display !== 'none' && !!document.querySelector('.tut-bubble.on');
    };
    a.runs.startRun('classic');
    await wait(300);
    // Как «Забрать» в окне итогов: окно ещё закрывается, а Обсерватория уже открыта; сразу поверх — дар ночи
    const reward = modal('итоги ночи', {});
    Object.assign(a.run, { gold: 30, phase: 'reward', reward: { base: 0, moves: 0, burns: 0, interest: 0, total: 0 }, night: null });
    reward.close();
    a.runs.collectReward();
    const gift = modal('дар ночи', {});
    await wait(1200);
    const underGift = shown();
    gift.close();
    await wait(1200);
    const afterGift = shown();
    // Окно посреди шагов: проводник прячется и возвращается
    const sheet = modal('лист', {});
    await wait(300);
    const underSheet = shown();
    sheet.close();
    await wait(500);
    return { underGift, afterGift, underSheet, afterSheet: shown() };
  });
  expect(log).toEqual({ underGift: false, afterGift: true, underSheet: false, afterSheet: true });
  expect(errors).toEqual([]);
});
