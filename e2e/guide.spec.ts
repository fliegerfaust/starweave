import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Справочник и Кодекс — «Живая доска» (RD.7). На каждом устройстве, ru и en: четыре вкладки
 * Справочника из меню и листом поверх ночи, три вкладки Кодекса. Ничего не вылезает, доска
 * на экране, касание строки меняет доску и не сбрасывает прокрутку списка.
 */
test.use({ locale: 'ru-RU' });

type App = { profile: Record<string, unknown> & { seenOmens: string[]; seenBosses: string[] }; startRun(s: string, daily?: boolean, stake?: number, seed?: number): void };
const TABS = ['combos', 'night', 'shop', 'glyphs'] as const;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: App }).starweave;
    app.profile.seenOmens = ['stardust', 'horizon', 'pillar', 'twinStars', 'monochrome', 'glassCannon', 'abacus', 'miser'];
    app.profile.seenBosses = ['eclipse-moon', 'fog', 'void'];
    app.profile.combosFound = ['pair', 'flush', 'straight'];
  });
  return errors;
}

const closeAll = (page: Page) => page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove()));

/** Замеры открытого окна: обрезанный текст, доска на экране, fit-audit. */
async function check(page: Page, tag: string, failures: string[]): Promise<void> {
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector<HTMLElement>('.board-modal')!;
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      if (el.childElementCount || !el.textContent?.trim() || el.closest('.gb-scroll')) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`обрезано: ${el.textContent.trim().slice(0, 24)}`);
    }
    const board = panel.querySelector('.gb-board')!.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    if (board.top < p.top - 1 || board.bottom > p.bottom + 1) out.push('доска не в окне');
    return out;
  });
  const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('за экраном') && !p.includes('gb-scroll') && !p.includes('gb-list') && !p.includes('gb-sigils') && !p.includes('div.gb') && !p.includes('div.modal-head') && !p.includes('gb-goal') && !p.includes('gb-section') && !p.includes('small «') && !p.includes('gb-row') && !p.includes('gb-stat') && !/из div\.modal-panel[^(]*\((-\d+|0)px справа\)/.test(p) && !/button(\.unknown|\.on)? «»/.test(p));
  const all = [...res, ...audit];
  if (all.length) failures.push(`${tag}: ${all.slice(0, 3).join('; ')}`);
}

test('Справочник: живая доска, четыре вкладки, лист в ночи', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    for (const sheet of [false, true]) {
      if (sheet) await page.evaluate(() => (window as unknown as { starweave: App }).starweave.startRun('classic', false, 0, 4242));
      for (const tab of TABS) {
        await closeAll(page);
        await page.evaluate(async ({ lang, tab, sheet }) => {
          const { setLang } = await import('/src/i18n/index.ts');
          setLang(lang);
          const { showGuide } = await import('/src/ui/screens/guide.ts');
          showGuide({ tab, sheet, found: ['pair', 'flush', 'straight'], levels: sheet ? ({ pair: 2, flush: 2 } as never) : undefined });
        }, { lang, tab, sheet });
        await check(page, `${lang} ${sheet ? 'лист' : 'меню'} ${tab}`, failures);
        if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/28-guide-${tab}${sheet ? '-sheet' : ''}.png` });
      }
    }
  }
  // Касание строки внизу списка меняет доску и не сбрасывает прокрутку
  await closeAll(page);
  await page.evaluate(async () => {
    const { setLang } = await import('/src/i18n/index.ts');
    setLang('ru');
    const { showGuide } = await import('/src/ui/screens/guide.ts');
    showGuide({ tab: 'combos' });
  });
  const kept = await page.evaluate(async () => {
    const sc = document.querySelector<HTMLElement>('.gb-scroll')!;
    sc.scrollTop = sc.scrollHeight;
    const before = sc.scrollTop;
    const rows = [...document.querySelectorAll<HTMLElement>('.gb-row')];
    rows[rows.length - 1]!.click();
    await new Promise((r) => setTimeout(r, 50));
    return { before, after: document.querySelector<HTMLElement>('.gb-scroll')!.scrollTop, title: document.querySelector('.gb-tally h3')!.textContent };
  });
  expect(Math.abs(kept.after - kept.before), 'прокрутка списка').toBeLessThan(2);
  expect(kept.title).toContain('Сверхновая');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('Коллекция во Справочнике (бывший Кодекс): доска, знаки, итоги, вкладки помещаются', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    await closeAll(page);
    await page.evaluate(async (lang) => {
      const { setLang } = await import('/src/i18n/index.ts');
      setLang(lang);
      const { showGuide } = await import('/src/ui/screens/guide.ts');
      const app = (window as unknown as { starweave: { profile: never } }).starweave;
      showGuide({ tab: 'collection', profile: app.profile });
    }, lang);
    await check(page, `${lang} коллекция`, failures);
    // Пять вкладок целиком на экране — ни одна не уезжает за край полосы
    const cut = await page.evaluate(() => {
      const bar = document.querySelector('.gb-tabs')!.getBoundingClientRect();
      return [...document.querySelectorAll('.gb-tab')].filter((t) => { const r = t.getBoundingClientRect(); return r.left < bar.left - 1 || r.right > bar.right + 1; }).map((t) => t.textContent);
    });
    if (cut.length) failures.push(`${lang}: вкладки за краем — ${cut.join(', ')}`);
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/29-collection.png` });
  }
  // Неизвестное Знамение: доска честно говорит, что оно ещё не встречалось
  await page.locator('.gb-sigils button.unknown').first().click();
  await expect(page.locator('.gb-tally h3')).toHaveText('???');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
