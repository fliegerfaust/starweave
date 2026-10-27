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

type App = { profile: Record<string, unknown> & { seenOmens: string[]; seenBosses: string[] }; runs: { startRun(s: string, daily?: boolean, stake?: number, seed?: number): void } };
const TABS = ['combos', 'night', 'shop', 'glyphs', 'bodies'] as const;

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
      if (sheet) await page.evaluate(() => (window as unknown as { starweave: App }).starweave.runs.startRun('classic', false, 0, 4242));
      for (const tab of TABS) {
        await closeAll(page);
        await page.evaluate(async ({ lang, tab, sheet }) => {
          const { setLang } = await import('/src/i18n/index.ts');
          setLang(lang);
          const { showGuide } = await import('/src/ui/screens/guide.ts');
          // Тела (GF.5) — во вкладке «Карты», когда тело открыто: профиль с победами над Затмениями
          const app = (window as unknown as { starweave: App }).starweave;
          const profile = tab === 'bodies' ? ({ ...app.profile, eclipses: 3 } as never) : undefined;
          showGuide({ tab: tab === 'bodies' ? undefined : tab, focus: tab === 'bodies' ? 'body-meteor' : undefined, sheet, profile, found: ['pair', 'flush', 'straight'], levels: sheet ? ({ pair: 2, flush: 2 } as never) : undefined });
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

test('Коллекция своим окном (CL.2): доска, знаки, итоги первым разделом помещаются', async ({ page }) => {
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
    // Вкладок правил в Коллекции нет; итоги видны ровно одним блоком (в списке или под доской) и целиком в окне
    const cut = await page.evaluate(() => {
      if (document.querySelector('.collection-modal .gb-tabs')) return ['вкладки правил в Коллекции'];
      const shown = [...document.querySelectorAll<HTMLElement>('.collection-modal .coll-block')].filter((b) => b.offsetParent);
      if (shown.length !== 1) return [`блоков итогов: ${shown.length}`];
      const box = shown[0]!.getBoundingClientRect();
      return [...shown[0]!.querySelectorAll('.gb-stat')].filter((t) => { const r = t.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).map((t) => t.textContent ?? '');
    });
    if (cut.length) failures.push(`${lang}: итоги — ${cut.join(', ')}`);
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/29-collection.png` });
  }
  // Неизвестное Знамение: доска честно говорит, что оно ещё не встречалось
  await page.locator('.gb-sigils button.unknown').first().click();
  await expect(page.locator('.gb-tally h3')).toHaveText('???');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Замечание Дениса: при переключении глифов, созвездий, разделов и коллекции доска не
 * меняет размер — высота одна на вкладку.
 */
test('Справочник: доска не меняет размер при переключении', async ({ page }) => {
  const errors = await boot(page);
  const jumps: string[] = [];
  for (const tab of ['combos', 'night', 'shop', 'glyphs', 'collection'] as const) {
    const heights = await page.evaluate(async (tab) => {
      document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
      const { showGuide } = await import('/src/ui/screens/guide.ts');
      showGuide({ tab, profile: (window as unknown as { starweave: { profile: never } }).starweave.profile, found: ['pair'] });
      await document.fonts.ready;
      // Окно открывается с лёгким увеличением — меряем после появления
      await new Promise((r) => setTimeout(r, 600));
      const sel = tab === 'collection' ? '.gb-sigils button' : '.gb-scroll .gb-row';
      const set = new Set([Math.round(document.querySelector('.gb-board')!.getBoundingClientRect().height)]);
      const n = document.querySelectorAll(sel).length;
      for (let i = 0; i < n; i++) {
        document.querySelectorAll<HTMLElement>(sel)[i]!.click();
        await new Promise((r) => setTimeout(r, 10));
        set.add(Math.round(document.querySelector('.gb-board')!.getBoundingClientRect().height));
      }
      return [...set];
    }, tab);
    if (heights.length > 1) jumps.push(`${tab}: ${heights.join(' / ')}`);
  }
  expect(jumps, 'доска прыгает').toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Коллекция трофеев (TR.4, вариант A4 Дениса): взятый в сцене «Небо сдаётся» трофей
 * считается приручением; в коллекции приручённое Затмение золотое, на доске главный трофей
 * и сколько раз приручён, Затмение строкой ниже. Ничего не вылезает, ru и en.
 */
test('коллекция трофеев: взятый трофей приручён, доска трофея помещается', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?trophy');
  await page.locator('.btn', { hasText: 'Забрать' }).click();
  // Карты выбора въезжают в сцену: касаемся, пока кнопка не проснётся
  await expect(async () => {
    await page.locator('.ts-card[data-k="trophy"]').click();
    await expect(page.locator('.ts-go')).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await page.locator('.ts-go').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { starweave: { profile: { tamed?: Record<string, number> } } }).starweave.profile.tamed)).toEqual({ gravity: 1 });
  // Сохранено на устройство: после перезагрузки счёт тот же
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    await closeAll(page);
    await page.evaluate(async (lang) => {
      const { setLang } = await import('/src/i18n/index.ts');
      setLang(lang);
      const app = (window as unknown as { starweave: App & { profile: { eclipses?: number; tamed?: Record<string, number> } } }).starweave;
      Object.assign(app.profile, { eclipses: 6, seenBosses: ['gravity', 'eclipse-moon', 'fog'] });
      app.profile.tamed = { ...app.profile.tamed, fog: 3 };
      const { showGuide } = await import('/src/ui/screens/guide.ts');
      showGuide({ tab: 'collection', profile: app.profile as never });
    }, lang);
    await expect(page.locator('.gb-sigils button.tamed')).toHaveCount(2);
    for (const label of lang === 'ru' ? ['Тяготение', 'Затмение Луны'] : ['Gravity', 'Lunar Eclipse']) {
      await page.locator(`.gb-sigils button[aria-label="${label}"]`).click();
      await expect(page.locator('.gb-tally .gb-ecl b')).toHaveText(label);
      await check(page, `${lang} ${label}`, failures);
    }
    // Доска трофея не меняет высоту при переключении знаков
    const heights = await page.evaluate(async () => {
      const set = new Set<number>();
      for (const b of document.querySelectorAll<HTMLElement>('.gb-sigils button')) {
        b.click();
        await new Promise((r) => setTimeout(r, 10));
        set.add(Math.round(document.querySelector('.gb-board')!.getBoundingClientRect().height));
      }
      return [...set];
    });
    if (heights.length > 1) failures.push(`${lang}: доска прыгает ${heights.join(' / ')}`);
    if (lang === 'ru') {
      await page.locator('.gb-sigils button[aria-label="Затмение Луны"]').click();
      await expect(page.locator('.gb-tally .gb-kind')).toHaveText('трофей · ещё не приручён');
      await page.locator('.gb-sigils button[aria-label="Тяготение"]').click();
      await expect(page.locator('.gb-tally .gb-kind')).toHaveText('трофей · Приручён 1 раз');
      await expect(page.locator('.gb-board canvas.gb-big.gold')).toHaveCount(1);
      await page.screenshot({ path: `e2e-results/${test.info().project.name}/29-trophies.png` });
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
