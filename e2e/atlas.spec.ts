import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Атлас и архив: помещаются по ширине, кнопки под палец, без ошибок; тестовая покупка.
 * Снимки — по-русски и после всех анимаций, со всеми состояниями оплаты.
 */
test.use({ locale: 'ru-RU' });

type W = {
  starweave: {
    goAtlas(from: string, focus?: string): Promise<void>;
    goArchive(): Promise<void>;
    purchases: { has(id: string): boolean; add(id: string): void };
    profile: { archive?: Record<string, { ante: number; best: number; won?: boolean }> };
  };
};

async function boot(page: Page, query = '?fakepay'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  await page.goto('/' + query);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

/** Снимок после всех анимаций (проявление экрана, табличка, тост). */
// Бесконечные анимации (живое небо рисуется на канвасе, не CSS) не ждём — только конечные
const settle = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 8000 });

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/${name}.png` });
}

async function fits(page: Page, root: string): Promise<void> {
  await settle(page);
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const tooSmall = [...el.querySelectorAll('button')].filter((b) => {
      const box = b.getBoundingClientRect();
      return box.width > 0 && box.height < 30 && !b.classList.contains('link-btn');
    }).length;
    return { scrollW: el.scrollWidth, w: el.clientWidth, tooSmall };
  }, root);
  expect(r.scrollW, `${root}: горизонтальная прокрутка`).toBeLessThanOrEqual(r.w + 1);
  expect(r.tooSmall, `${root}: кнопки ниже 30px`).toBe(0);
}

const openAtlas = async (page: Page, focus?: string) => {
  await page.evaluate((f) => (window as unknown as W).starweave.goAtlas('e2e', f), focus);
  await page.waitForSelector('.atl-body');
};

test('атлас: обложка, покупка, примерочная, меценат', async ({ page }) => {
  const errors = await boot(page);
  // Цена «грузится»: задерживаем ответ площадки
  await page.evaluate(() => {
    const p = (window as unknown as { starweave: { platform: { payments: { prices(): Promise<Record<string, string>> } } } }).starweave.platform.payments;
    const orig = p.prices.bind(p);
    p.prices = () => new Promise((r) => setTimeout(() => r(orig()), 4000));
  });
  await openAtlas(page);
  await expect(page.locator('.atl-hero')).toBeVisible();
  await expect(page.locator('.atl-buy .atl-pr')).toHaveText('…');
  await shot(page, '19-atlas-loading');
  await expect(page.locator('.atl-buy .atl-pr')).not.toHaveText('…', { timeout: 8000 });
  await expect(page.locator('.atl-buy .tstar')).toBeVisible();
  await fits(page, '.atlas');
  await shot(page, '20-atlas');

  // Примерочная: живая сцена; касание в прокрученной ленте не уводит наверх
  await page.click('.atl-tab >> nth=1');
  await page.waitForSelector('.atl-stage canvas');
  await page.click('.atl-item:has-text("Комета")');
  await page.click('.atl-item:has-text("Северное сияние")');
  await expect(page.locator('.atl-cta .atl-buy')).toContainText('Купить');
  const kept = await page.evaluate(async () => {
    const sc = [...document.querySelectorAll<HTMLElement>('.atl-right, .atl-body')].find((e) => e.scrollHeight > e.clientHeight + 2);
    if (!sc) return { before: 0, after: 0, visible: true };
    sc.scrollTop = sc.scrollHeight;
    const before = sc.scrollTop;
    document.querySelector<HTMLElement>('.atl-item:has(+ .atl-item) ~ .atl-item')!.click();
    await new Promise((r) => setTimeout(r, 50));
    const again = [...document.querySelectorAll<HTMLElement>('.atl-right, .atl-body')].find((e) => e.scrollHeight > e.clientHeight + 2)!;
    const r = document.querySelector('.atl-stage')!.getBoundingClientRect();
    return { before, after: again.scrollTop, visible: r.top >= -1 && r.bottom <= innerHeight };
  });
  expect(kept.after, 'прокрутка лент после касания').toBe(kept.before);
  expect(kept.visible, 'сцена на экране').toBe(true);
  await fits(page, '.atlas');
  await page.waitForTimeout(800);
  await shot(page, '24-look');

  // Поддержать: набор мецената
  await page.click('.atl-tab >> nth=2');
  await page.waitForSelector('.hero-support canvas');
  await fits(page, '.atlas');
  await shot(page, '25-patron');
  await page.click('.atl-tab >> nth=0');
  await page.waitForSelector('.hero-atlas');

  await page.click('.atl-buy');
  await page.waitForSelector('[data-r="paid"]');
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-r]')!.parentElement!.parentElement!.style.setProperty('visibility', 'hidden'));
  await expect(page.locator('.atl-buy')).toBeDisabled();
  await shot(page, '20b-atlas-busy');
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-r]')!.parentElement!.parentElement!.style.removeProperty('visibility'));
  await page.click('[data-r="paid"]');
  await page.waitForSelector('.atl-owned');
  expect(await page.evaluate(() => (window as unknown as W).starweave.purchases.has('atlas'))).toBe(true);
  // Тост исчезает через ~2 с
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 5000 });
  await expect(page.locator('.atl-two .btn').nth(1)).toHaveText(/Астролябия/);
  await shot(page, '21-atlas-owned');
  expect(errors).toEqual([]);
});

/**
 * «Разворот» на каждом устройстве: три вкладки × можно купить / куплено, ru и en. Ничего не
 * обрезано и не вылезает, кнопка на экране, середина не уходит под неё; веер примерочной
 * над подписью; на ПК — собранный блок без пустого поля.
 */
test('атлас: вкладки и состояния без вылезаний', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    for (const owned of [false, true]) {
      await page.evaluate(async ({ lang, owned }) => {
        const { setLang } = await import('/src/i18n/index.ts');
        setLang(lang);
        if (owned) (window as unknown as W).starweave.purchases.add('supporter');
      }, { lang, owned });
      for (const focus of [undefined, 'wardrobe', 'support']) {
        await openAtlas(page, focus);
        await page.waitForTimeout(400);
        await settle(page);
        const tag = `${lang} ${owned ? 'куплено' : 'купить'} ${focus ?? 'atlas'}`;
        const res = await page.evaluate(() => {
          const out: string[] = [];
          const root = document.querySelector<HTMLElement>('.atlas')!;
          for (const el of root.querySelectorAll<HTMLElement>('*')) {
            if (el.childElementCount || !el.textContent?.trim() || el.closest('.atl-strip')) continue;
            if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`обрезано: ${el.textContent.trim().slice(0, 24)}`);
          }
          const cta = root.querySelector('.atl-cta')!.getBoundingClientRect();
          const body = root.querySelector('.atl-body')!.getBoundingClientRect();
          if (cta.bottom > innerHeight + 1) out.push('кнопка за экраном');
          if (body.bottom > cta.top + 1) out.push('середина под кнопкой');
          const stage = root.querySelector('.atl-stage')?.getBoundingClientRect();
          if (stage && (stage.top < -1 || stage.bottom > cta.top + 1)) out.push('сцена не на экране');
          if (matchMedia('(min-width: 900px) and (min-height: 561px)').matches) {
            const top = root.querySelector('.atl-top')!.getBoundingClientRect().top;
            const gap = innerHeight - cta.bottom;
            if (Math.abs(top - gap) > 90 && Math.min(top, gap) > 60) out.push(`ПК: пусто сверху ${Math.round(top)}, снизу ${Math.round(gap)}`);
          }
          return out;
        });
        const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('за экраном') && !p.includes('atl-strip') && !p.includes('atl-body') && !p.includes('atl-right'));
        const all = [...res, ...audit];
        if (all.length) failures.push(`${tag}: ${all.slice(0, 3).join('; ')}`);
        if (lang === 'ru') await shot(page, `26-atlas-${owned ? 'owned' : 'buy'}-${focus ?? 'atlas'}`);
      }
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('атлас на обычном сайте без покупок', async ({ page }) => {
  const errors = await boot(page, '');
  await openAtlas(page);
  await expect(page.locator('.atl-note')).toBeVisible();
  await fits(page, '.atlas');
  await shot(page, '23-atlas-web');
  expect(errors).toEqual([]);
});

test('архив: журнал без атласа и у владельца', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as W).starweave.goArchive());
  await page.waitForSelector('.arc-log');
  await fits(page, '.archive');
  // Без атласа прошлый день мягко ведёт в атлас
  await expect(page.locator('.arc-note')).toBeVisible();
  await shot(page, '22-archive');
  await page.evaluate(() => {
    const app = (window as unknown as W).starweave;
    app.purchases.add('atlas');
    app.profile.archive = { '2026-10-03': { ante: 4, best: 812 }, '2026-10-05': { ante: 8, best: 2400, won: true }, '2026-10-01': { ante: 2, best: 120 } };
    return app.goArchive();
  });
  await page.waitForSelector('.arc-log');
  await page.click('.arc-row:has(.arc-best:not(.none))');
  await expect(page.locator('.arc-cta .btn')).toHaveText(/Сыграть ещё раз/);
  await shot(page, '22b-archive-owned');
  expect(errors).toEqual([]);
});

/**
 * «Журнал наблюдений» на каждом устройстве: без атласа, с атласом и итогами, с атласом без
 * игр; ru и en. Ничего не вылезает, кнопка на экране, середина не под ней, на ПК без пустого
 * поля; касание строки внизу журнала не сбрасывает прокрутку.
 */
test('архив: состояния без вылезаний, прокрутка держится', async ({ page }) => {
  const errors = await boot(page);
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    for (const st of ['free', 'owned', 'fresh']) {
      await page.evaluate(async ({ lang, st }) => {
        const { setLang } = await import('/src/i18n/index.ts');
        setLang(lang);
        const app = (window as unknown as W).starweave;
        if (st !== 'free') app.purchases.add('atlas');
        app.profile.archive = st === 'fresh' ? {} : { '2026-10-14': { ante: 3, best: 412 }, '2026-10-12': { ante: 5, best: 980 }, '2026-10-10': { ante: 8, best: 2400, won: true }, '2026-10-09': { ante: 2, best: 160 }, '2026-10-05': { ante: 6, best: 1310 } };
        await app.goArchive();
      }, { lang, st });
      await page.waitForSelector('.arc-log');
      await settle(page);
      const res = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.querySelector<HTMLElement>('.archive')!;
        for (const el of root.querySelectorAll<HTMLElement>('*')) {
          if (el.childElementCount || !el.textContent?.trim() || el.closest('.arc-meta')) continue;
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`обрезано: ${el.textContent.trim().slice(0, 24)}`);
        }
        const cta = root.querySelector('.arc-cta')!.getBoundingClientRect();
        const body = root.querySelector('.arc-body')!.getBoundingClientRect();
        if (cta.bottom > innerHeight + 1) out.push('кнопка за экраном');
        if (body.bottom > cta.top + 1) out.push('середина под кнопкой');
        if (matchMedia('(min-width: 900px) and (min-height: 561px)').matches) {
          const top = root.querySelector('.arc-top')!.getBoundingClientRect().top;
          const gap = innerHeight - cta.bottom;
          if (Math.abs(top - gap) > 90 && Math.min(top, gap) > 60) out.push(`ПК: пусто сверху ${Math.round(top)}, снизу ${Math.round(gap)}`);
        }
        return out;
      });
      const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('за экраном') && !p.includes('arc-log') && !p.includes('arc-body'));
      const kept = await page.evaluate(async () => {
        const sc = [...document.querySelectorAll<HTMLElement>('.arc-log, .arc-body')].find((e) => e.scrollHeight > e.clientHeight + 2);
        if (!sc) return true;
        sc.scrollTop = sc.scrollHeight;
        const before = sc.scrollTop;
        const rows = [...document.querySelectorAll<HTMLElement>('.arc-row')];
        rows[rows.length - 1]!.click();
        await new Promise((r) => setTimeout(r, 50));
        const again = [...document.querySelectorAll<HTMLElement>('.arc-log, .arc-body')].find((e) => e.scrollHeight > e.clientHeight + 2)!;
        return Math.abs(again.scrollTop - before) < 2 || again.scrollTop >= again.scrollHeight - again.clientHeight - 2;
      });
      const all = [...res, ...audit, ...(kept ? [] : ['прокрутка сбросилась'])];
      if (all.length) failures.push(`${lang} ${st}: ${all.slice(0, 3).join('; ')}`);
      if (lang === 'ru') await shot(page, `27-archive-${st}`);
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
