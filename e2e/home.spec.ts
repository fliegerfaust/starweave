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
