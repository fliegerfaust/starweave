import { expect, test } from '@playwright/test';

/**
 * Главная — «Обсерватория»: safe area и место. Эмулируем вырез iPhone (сверху 59 px, снизу
 * 34 px) и проверяем на каждом устройстве: арка щели начинается под вырезом, пульт не
 * прокручивается, между кнопками и «Библиотекой» нет пустоты (свободное место забирает
 * щель), в ландшафте и на ПК главная кнопка по своей ширине, а не во всё окно.
 */
test.use({ locale: 'ru-RU' });

test('главная: арка под safe area, без пустот, кнопка не растянута', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const landscape = await page.evaluate(() => document.body.classList.contains('landscape'));
  const safe = landscape ? { top: 0, bottom: 21 } : { top: 59, bottom: 34 };
  await page.evaluate((s) => {
    document.documentElement.style.setProperty('--safe-top', `${s.top}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${s.bottom}px`);
  }, safe);
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const menu = document.querySelector('.menu')!;
    const slit = getComputedStyle(document.querySelector('.observatory')!).getPropertyValue('--slit-top');
    return {
      scope: r('.dome-scope').top,
      slitTop: parseFloat(slit),
      scrolls: menu.scrollHeight > menu.clientHeight + 1,
      gap: r('.menu-handle').top - r('.menu-pair').bottom,
      handleBottom: r('.menu-handle').bottom,
      primary: r('.menu-primary').width,
      vh: innerHeight,
    };
  });
  expect(m.scope, 'щель под вырезом').toBeGreaterThanOrEqual(safe.top);
  expect(Math.abs(m.slitTop - m.scope), 'купол нарисован от той же точки').toBeLessThan(1);
  if (m.vh > 600 || landscape) expect(m.scrolls, 'пульт без прокрутки').toBe(false);
  expect(m.gap, 'нет пустоты над «Библиотекой»').toBeLessThan(48);
  expect(m.handleBottom, '«Библиотека» над нижним вырезом').toBeLessThanOrEqual(m.vh - safe.bottom);
  if (landscape) expect(m.primary, 'главная кнопка не растянута').toBeLessThanOrEqual(340);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/01-home-safe.png` });
  expect(errors).toEqual([]);
});

/**
 * Окна главной — «Табличка» (RD.10): выбор неба (небеса веером, сложность ступенями),
 * вызов от друга, «Начать заново?». На каждом устройстве: окно без прокрутки, ничего не
 * обрезано и не за экраном, на ПК и в ландшафте кнопки по своей ширине; тост — под вырезом.
 */
test('окна главной: небо, вызов, подтверждение, тост', async ({ page }) => {
  type A = { profile: Record<string, unknown>; pendingChallenge: unknown; goMenu(): Promise<void>; startRun(s: string): void; run: Record<string, unknown> };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const landscape = await page.evaluate(() => document.body.classList.contains('landscape'));
  // Портрет — как полноэкранный Telegram на iPhone: вырез и кнопки Telegram сверху (105 px)
  if (!landscape) {
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '105px');
      document.documentElement.style.setProperty('--safe-bottom', '34px');
    });
  }
  const failures: string[] = [];
  const audit = async (tag: string) => {
    await page.waitForTimeout(500);
    const res = await page.evaluate((landscape) => {
      const out: string[] = [];
      const panel = [...document.querySelectorAll<HTMLElement>('.modal-panel')].pop()!;
      if (panel.scrollHeight > panel.clientHeight + 2) out.push(`прокрутка ${panel.scrollHeight - panel.clientHeight}`);
      for (const el of panel.querySelectorAll<HTMLElement>('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) out.push(`за экраном ${el.className}`);
        if (!el.childElementCount && el.textContent?.trim() && el.scrollWidth > el.clientWidth + 1) out.push(`обрезано ${el.textContent.trim().slice(0, 20)}`);
      }
      if (landscape) for (const b of panel.querySelectorAll('.win-acts .btn')) if (b.getBoundingClientRect().width > 300) out.push('растянута кнопка');
      // Кнопки окна — над нижним вырезом, без прокрутки до них
      const sb = landscape ? 0 : 34;
      for (const b of panel.querySelectorAll('.win-acts .btn')) if (b.getBoundingClientRect().bottom > innerHeight - sb + 1 || b.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom + 1) out.push('кнопка не видна');
      return [...new Set(out)];
    }, landscape);
    if (res.length) failures.push(`${tag}: ${res.slice(0, 3).join('; ')}`);
  };
  await page.evaluate(() => Object.assign((window as unknown as { starweave: A }).starweave.profile, { tutorialDone: true, runs: 5, maxStake: 3, unlockedSkies: ['classic', 'twins', 'wanderer'] }));
  await page.locator('.menu-pair .menu-lite').first().click();
  await page.waitForSelector('.sky-win .sky-row');
  expect(await page.locator('.sky-row').count()).toBe(6);
  await page.locator('.sky-row[data-sky="twins"] button').click();
  await page.locator('.sky-dots button').nth(2).click();
  await expect(page.locator('.sky-row.on')).toHaveAttribute('data-sky', 'twins');
  await expect(page.locator('.sky-stake-top b')).toHaveText('Звёздность 2');
  await audit('небо');
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/02-home-sky.png` });

  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
    a.pendingChallenge = { seed: 42, skyId: 'classic', stake: 1, ante: 5, best: 1240 };
    await a.goMenu();
  });
  await page.waitForSelector('.modal-panel.challenge .win-stats');
  await audit('вызов');
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/03-home-challenge.png` });

  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
    a.startRun('classic');
    await new Promise((r) => setTimeout(r, 300));
    Object.assign(a.run, { ante: 3, nightIndex: 1, gold: 12, omens: [{ id: 'stardust', uid: 1 }, { id: 'miser', uid: 2 }] });
    await a.goMenu();
  });
  await page.locator('.menu-pair .menu-lite').first().click();
  await page.waitForSelector('.modal-panel.confirm .run-line');
  await expect(page.locator('.run-line b')).toHaveText('Глава III · Полночь');
  await audit('начать заново');
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/04-home-confirm.png` });

  await page.evaluate(async () => {
    document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
    document.documentElement.style.setProperty('--safe-top', '59px');
    const { toast } = await import('/src/ui/widgets.ts');
    toast('Открыто: Близнецы');
  });
  const top = await page.locator('.toast').evaluate((el) => el.getBoundingClientRect().top);
  expect(top, 'тост под вырезом').toBeGreaterThanOrEqual(59);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
