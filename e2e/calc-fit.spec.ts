import { expect, test } from '@playwright/test';

/**
 * Лоток подсчёта (CQ.10): на кресте со Знамениями (демо surge — очки до 27 774) числа не шире
 * своих ячеек, ячейки не выходят за лоток, на каждом устройстве и на широком ПК.
 */
test.use({ locale: 'ru-RU' });

test('лоток подсчёта: длинные очки помещаются в ячейку (CQ.10)', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const wide = info.project.name === 'desktop' ? '&ff=wideDesktop,brightFlare' : '';
  await page.goto(`/?demo=surge&lang=ru${wide}`);
  const found = new Set<string>();
  let maxTotal = 0;
  const t0 = Date.now();
  // Демо — четыре хода от нуля до победы; лоток проверяем всё время, пока он открыт
  while (Date.now() - t0 < 45_000 && !(await page.locator('.modal-panel').count())) {
    const r = await page.evaluate(() => {
      const calc = document.querySelector('.calc.show');
      if (!calc) return null;
      const c = calc.getBoundingClientRect();
      const out: string[] = [];
      for (const el of calc.querySelectorAll<HTMLElement>('.calc-cell')) {
        const r = el.getBoundingClientRect();
        if (r.right > c.right + 1 || r.left < c.left - 1) out.push(`ячейка за лотком на ${Math.round(Math.max(r.right - c.right, c.left - r.left))}px`);
        if (el.scrollWidth > el.clientWidth + 1) out.push(`текст шире ячейки: «${el.textContent}»`);
      }
      return { out, total: Number((calc.querySelector('.calc-total')?.textContent ?? '0').replace(/\D/g, '')) || 0 };
    });
    if (r) {
      r.out.forEach((x) => found.add(x));
      maxTotal = Math.max(maxTotal, r.total);
    }
    await page.waitForTimeout(50);
  }
  expect(maxTotal, 'дошли до пятизначных очков').toBeGreaterThanOrEqual(10_000);
  expect([...found]).toEqual([]);
  expect(errors).toEqual([]);
});
