import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * «Зал славы» (HF.3): вход из Библиотеки после первого забега; на каждом устройстве, ru и en —
 * ничего не вылезает, список не уходит вбок, строки не ниже 44 px, доска одной высоты для
 * рекорда и достижения, касание строки меняет доску.
 */
test.use({ locale: 'ru-RU' });

type App = { profile: Record<string, unknown>; runs: { persistProfile(): void } };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

async function openHall(page: Page, lang: 'ru' | 'en'): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove()));
  await page.evaluate(async (lang) => {
    const { setLang } = await import('/src/i18n/index.ts');
    setLang(lang);
    const app = (window as unknown as { starweave: App }).starweave;
    const { hallDemo } = await import('/src/dev/hall-demo.ts');
    const stats = hallDemo(app.profile as never, false);
    const { showHall } = await import('/src/ui/screens/hall.ts');
    showHall(app.profile as never, stats);
  }, lang);
  await page.waitForTimeout(600);
}

test('Зал славы: вход из Библиотеки', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: App }).starweave;
    Object.assign(app.profile, { runs: 3, tutorialDone: true, bestPlacement: 900 });
  });
  await page.locator('.menu-handle').click();
  const row = page.locator('.lib-row', { hasText: 'Зал славы' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('.hall-modal .hall-sky')).toBeVisible();
  await expect(page.locator('.hall-modal .hall-row.feat').first()).toBeVisible();
  expect(errors).toEqual([]);
});

/** Главная опытного игрока: профиль после нескольких забегов, меню собирается заново. */
async function seasonedHome(page: Page, seen: number | null): Promise<void> {
  await page.evaluate(async (seen) => {
    if (seen == null) localStorage.removeItem('starweave.hallseen.v1');
    else localStorage.setItem('starweave.hallseen.v1', String(seen));
    const app = (window as unknown as { starweave: App & { router: { goMenu(): Promise<void> } } }).starweave;
    Object.assign(app.profile, { runs: 3, tutorialDone: true, tutorialFinished: true, bestPlacement: 1400, bestAnte: 3, totalLines: 40 });
    app.runs.persistProfile();
    await app.router.goMenu();
  }, seen);
  await page.waitForTimeout(400);
}

test('Зал славы на главной: строка гордости вместо слогана, ничего не наезжает', async ({ page }) => {
  const errors = await boot(page);
  // Новичок строки не видит
  await expect(page.locator('.hall-pride')).toHaveCount(0);
  await seasonedHome(page, null);
  const pride = page.locator('.menu-feats .hall-pride');
  await expect(pride).toBeVisible();
  await expect(page.locator('.tagline')).toBeHidden();
  // Первый показ: всё открытое считается увиденным — не светится
  await expect(page.locator('.hall-pride.is-new')).toHaveCount(0);
  const res = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const a = r('.menu-feats .hall-pride'), b = r('.menu-feats .menu-shelf'), c = r('.menu-buttons .menu-primary'), t = r('.logo');
    const hit = (x: DOMRect, y: DOMRect) => x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1;
    const menu = document.querySelector<HTMLElement>('.menu')!;
    return {
      overlap: [hit(a, b), hit(a, c), hit(a, t), hit(b, c)],
      inside: a.left >= 0 && a.right <= innerWidth,
      height: a.height,
      sideways: menu.scrollWidth - menu.clientWidth,
    };
  });
  expect(res.overlap).toEqual([false, false, false, false]);
  expect(res.inside).toBe(true);
  expect(res.height).toBeGreaterThanOrEqual(30);
  expect(res.sideways).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('Зал славы на главной: новое достижение светится, пока зал не открыт', async ({ page }) => {
  const errors = await boot(page);
  await seasonedHome(page, 0);
  await expect(page.locator('.hall-pride.is-new')).toBeVisible();
  await page.locator('.hall-pride').click();
  await expect(page.locator('.hall-modal .hall-sky')).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove()));
  await expect(page.locator('.hall-pride')).toBeVisible();
  await expect(page.locator('.hall-pride.is-new')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Зал славы: вёрстка, строки и доска на всех устройствах', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    await openHall(page, lang);
    const res = await page.evaluate(() => {
      const out: string[] = [];
      const panel = document.querySelector<HTMLElement>('.hall-modal')!;
      const scroll = panel.querySelector<HTMLElement>('.gb-scroll')!;
      if (scroll.scrollWidth > scroll.clientWidth + 1) out.push(`список шире на ${scroll.scrollWidth - scroll.clientWidth}px`);
      for (const r of panel.querySelectorAll<HTMLElement>('.hall-row')) {
        const box = r.getBoundingClientRect();
        if (box.height && box.height < 43.5) out.push(`строка ${Math.round(box.height)}px: ${r.textContent?.trim().slice(0, 20)}`);
      }
      const board = panel.querySelector<HTMLElement>('.hall-sky')!;
      const p = panel.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      if (b.top < p.top - 1 || b.bottom > p.bottom + 1) out.push('доска не в окне');
      // Небо не схлопывается в линию (окно Пикабу 1394×640 сжимало его до 10px)
      const sky = panel.querySelector<HTMLElement>('.hall-skycanvas')!.getBoundingClientRect().height;
      if (sky < 110) out.push(`небо ${Math.round(sky)}px`);
      return { out, height: b.height };
    });
    // Достижение на доске — та же высота, что у рекорда
    await page.locator('.hall-modal .gb-scroll .hall-row.feat').first().click();
    await page.waitForTimeout(300);
    const featHeight = await page.evaluate(() => document.querySelector('.hall-modal .hall-sky')!.getBoundingClientRect().height);
    if (Math.abs(featHeight - res.height) > 0.5) failures.push(`${lang}: доска ${res.height} → ${featHeight}`);
    await expect(page.locator('.hall-modal .hall-head.feat h3')).toBeVisible();
    const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((x) => !x.includes('canvas') && !x.includes('за экраном') && !x.includes('gb-scroll') && !x.includes('div.gb') && !x.includes('div.modal-head') && !x.includes('gb-section') && !x.includes('hall-row') && !x.includes('hall-feats') && !x.includes('hall-rows') && !x.includes('hall-group') && !x.includes('hall-spot') && !x.includes('hall-legend'));
    const all = [...res.out, ...audit];
    if (all.length) failures.push(`${lang}: ${all.slice(0, 4).join('; ')}`);
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/40-hall.png` });
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
