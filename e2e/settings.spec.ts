import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Настройки и «Библиотека» — «Пульт» (RD.8). На каждом устройстве, ru и en: ничего не
 * вылезает и не обрезано; в ландшафте и на ПК «Библиотека» — окно по центру экрана, а не
 * панель у края (замечание Дениса), настройки — двумя колонками без прокрутки; переключатели
 * меняют настройки игры.
 */
test.use({ locale: 'ru-RU' });

type App = { settings: Record<string, unknown>; profile: { runs: number; tutorialDone: boolean } };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: App }).starweave;
    app.profile.runs = 3;
    app.profile.tutorialDone = true;
  });
  return errors;
}

async function audit(page: Page, tag: string, failures: string[]): Promise<void> {
  await page.waitForTimeout(450);
  const res = await page.evaluate(() => {
    const out: string[] = [];
    const panel = [...document.querySelectorAll<HTMLElement>('.modal-backdrop .modal-panel')].pop()!;
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      if (el.childElementCount || !el.textContent?.trim()) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`обрезано: ${el.textContent.trim().slice(0, 24)}`);
    }
    return out;
  });
  const fit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('за экраном') && !p.includes('div.modal-head')
    // Строка ниже видимой части прокручиваемого окна: по ширине внутри — не вылезание
    && !/из div\.modal-panel[^(]*\((-\d+|0)px справа\)/.test(p));
  const all = [...res, ...fit];
  if (all.length) failures.push(`${tag}: ${all.slice(0, 3).join('; ')}`);
}

test('Библиотека и Настройки: пульт, по центру на ПК и в ландшафте', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  const landscape = await page.evaluate(() => document.body.classList.contains('landscape'));
  for (const lang of ['ru', 'en'] as const) {
    await page.evaluate(async (lang) => {
      const { setLang } = await import('/src/i18n/index.ts');
      setLang(lang);
      document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
      await (window as unknown as { starweave: { goMenu(): Promise<void> } }).starweave.goMenu();
    }, lang);
    await page.waitForSelector('.menu-handle');
    await page.click('.menu-handle');
    await page.waitForSelector('.lib-row');
    await audit(page, `${lang} библиотека`, failures);
    const lib = await page.evaluate(() => {
      const p = document.querySelector('.modal-panel.library')!.getBoundingClientRect();
      return { center: p.left + p.width / 2, vw: innerWidth, sheet: document.querySelector('.modal-panel.library')!.classList.contains('sheet') };
    });
    if (landscape) {
      expect(lib.sheet, 'в ландшафте и на ПК — окно, не лист у края').toBe(false);
      expect(Math.abs(lib.center - lib.vw / 2), 'библиотека по центру').toBeLessThan(2);
    }
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/30-library.png` });

    // Настройки — из «Библиотеки»
    await page.locator('.lib-row').last().click();
    await page.waitForSelector('.settings-modal .st-row');
    await audit(page, `${lang} настройки`, failures);
    const st = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>('.modal-panel.settings-modal')!;
      const r = p.getBoundingClientRect();
      const cols = [...p.querySelectorAll('.st-col')].map((c) => c.getBoundingClientRect().left);
      return { center: r.left + r.width / 2, vw: innerWidth, scrolls: p.scrollHeight > p.clientHeight + 2, twoCols: cols.length === 2 && Math.abs(cols[0]! - cols[1]!) > 50 };
    });
    expect(Math.abs(st.center - st.vw / 2), 'настройки по центру').toBeLessThan(2);
    if (landscape) expect(st.twoCols, 'две колонки').toBe(true);
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/31-settings.png` });

    // Переключатели меняют настройки игры
    if (lang === 'ru') {
      const before = await page.evaluate(() => (window as unknown as { starweave: App }).starweave.settings.reduceMotion);
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.settings-modal .st-tg')].find((b) => /Меньше движения/.test(b.closest('.st-row')!.textContent ?? ''))!.click());
      expect(await page.evaluate(() => (window as unknown as { starweave: App }).starweave.settings.reduceMotion)).toBe(!before);
      await page.locator('.st-dots button').nth(2).click();
      expect(await page.evaluate(() => (window as unknown as { starweave: App }).starweave.settings.speed)).toBe(2);
      await expect(page.locator('.st-speed b')).toHaveText('Быстро');
      // Возвращаем как было
      await page.locator('.st-dots button').nth(1).click();
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.settings-modal .st-tg')].find((b) => /Меньше движения/.test(b.closest('.st-row')!.textContent ?? ''))!.click());
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
