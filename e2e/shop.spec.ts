import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Обсерватория «Прилавок» (RD.4). На каждом устройстве и обоих языках: глава III, первая
 * глава, все места заняты и открытый пакет. Проверяем, что ничего не вылезает; на телефоне
 * товары и свои Знамения — над нижней панелью; дар ночи — веер и кнопки на экране, выбор карты ничего не сдвигает (если по высоте помещаются), в ландшафте строки
 * не заходят под панель, на ПК лавка — собранный блок без пустого поля (правило Дениса:
 * место на экране используется рационально); касание своего Знамения открывает лист продажи.
 */
type App = { profile: { tutorialDone: boolean; runs: number }; run: Record<string, unknown> & { shop: Record<string, unknown> }; runs: { startRun(s: string, daily?: boolean, stake?: number, seed?: number): void; collectReward(): void }; router: { route(): Promise<void> } };

async function open(page: Page, lang: 'ru' | 'en', state: string): Promise<void> {
  await page.evaluate(async ({ lang, state }) => {
    const { setLang } = await import('/src/i18n/index.ts');
    setLang(lang);
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const { createOmen } = await import('/src/core/omen-instance.ts');
    const app = (window as unknown as { starweave: App }).starweave;
    app.profile.tutorialDone = true;
    app.profile.runs = 12;
    // Фиксированный сид: витрина одна и та же, проверка не зависит от случая
    app.runs.startRun('classic', false, 0, 4242);
    await new Promise((r) => setTimeout(r, 300));
    const run = app.run as never as { ante: number; gold: number; omens: unknown[]; phase: string; reward: unknown; night: unknown; pending: unknown[] };
    run.ante = state === 'new' ? 1 : 3;
    run.gold = state === 'full' ? 23 : 14;
    const ids = state === 'full' ? ['horizon', 'corona', 'stardust', 'pyre', 'abacus'] : state === 'new' ? [] : ['horizon', 'pyre', 'stardust'];
    run.omens = ids.map((id) => createOmen(run as never, id));
    run.phase = 'reward';
    run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    run.night = null;
    // Тело в колоде: в даре и в листе колоды есть ряд тел (GF.5)
    (run as never as { deck: unknown[] }).deck.push({ id: 900, suit: 'sun', rank: 5, body: 'polaris' });
    app.runs.collectReward();
    await new Promise((r) => setTimeout(r, 300));
    // Дар ночи (GF.2) открывается поверх лавки — проверяем его отдельным состоянием
    if (state !== 'gift') {
      run.pending = [];
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    }
    if (state === 'pack') {
      run.pending = [{ kind: 'pack', pack: 'omen', options: ['twinStars', 'crossroads', 'abacus'] }];
      await app.router.route();
    }
  }, { lang, state });
  await page.waitForTimeout(700);
}

test('Обсерватория: строки товаров, бонус строкой, без вылезаний и пустот', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    for (const state of ['mid', 'new', 'full', 'pack', 'gift']) {
      await open(page, lang, state);
      const res = await page.evaluate((state) => {
        const out: string[] = [];
        const shop = document.querySelector<HTMLElement>('.shop')!;
        const bar = shop.querySelector('.shop-actions')!.getBoundingClientRect();
        const body = shop.querySelector('.shop-body')!.getBoundingClientRect();
        const land = matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
        const wide = matchMedia('(min-width: 900px) and (min-height: 561px)').matches;
        const cs = getComputedStyle(shop);
        const avail = shop.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (state === 'pack') return { out, shown: !!document.querySelector('.pack-scene') };
        if (state === 'gift') {
          const scene = document.querySelector<HTMLElement>('.gift-scene');
          if (!scene) return { out, shown: false };
          // Веер и кнопки — на экране
          for (const el of scene.querySelectorAll<HTMLElement>('.gift-card, .scene-acts .btn')) {
            const r = el.getBoundingClientRect();
            if (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1) out.push(`за экраном: ${el.className}`);
          }
          return { out, shown: scene.querySelectorAll('.gift-card').length === 3 };
        }
        // Обрезанный по высоте или ширине текст в строках товаров
        for (const el of shop.querySelectorAll<HTMLElement>('.ware *')) {
          if (el.childElementCount || !el.textContent?.trim()) continue;
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`обрезано: ${el.textContent.trim().slice(0, 20)}`);
        }
        const wares = [...shop.querySelectorAll<HTMLElement>('.shop-goods .ware')];
        if (land) {
          if (body.bottom > bar.top + 1) out.push('середина под панелью');
        } else if (!wide && avail >= 640) {
          const last = wares[wares.length - 1]!.getBoundingClientRect();
          const slots = shop.querySelector('.owned-omens')!.getBoundingClientRect();
          if (last.bottom > body.bottom + 1) out.push('товары ниже сгиба');
          if (slots.bottom > body.bottom + 1) out.push('свои Знамения ниже сгиба');
        }
        if (wide) {
          const top = shop.querySelector('.shop-top')!.getBoundingClientRect().top;
          const gapTop = top, gapBottom = innerHeight - bar.bottom;
          if (Math.abs(gapTop - gapBottom) > 90 && Math.min(gapTop, gapBottom) > 60) out.push(`пусто: сверху ${Math.round(gapTop)}, снизу ${Math.round(gapBottom)}`);
        }
        return { out, shown: true };
      }, state);
      const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('за экраном') && !p.includes('shop-actions') && !p.includes('div.modal-head'));
      const tag = `${lang} ${state}`;
      if (!res.shown) failures.push(`${tag}: ${state === 'gift' ? 'дар' : 'пакет'} не открылся`);
      if (res.out.length) failures.push(`${tag}: ${res.out.slice(0, 3).join('; ')}`);
      if (audit.length) failures.push(`${tag}: ${audit.slice(0, 3).join('; ')}`);
      if (state === 'gift') {
        // Правило Дениса: при выборе карты ничего на экране не меняет размер и место
        await page.waitForTimeout(1600);
        const boxes = () => page.evaluate(() => ['.gift-fan', '.gift-detail', '.scene-acts', '.scene-ribbon'].map((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.height), Math.round(r.width)].join(':'); }).join(' '));
        const seen = new Set([await boxes()]);
        for (const i of [0, 1, 2, 0]) {
          await page.locator('.gift-card').nth(i).click();
          await page.waitForTimeout(450);
          seen.add(await boxes());
        }
        if (seen.size > 1) failures.push(`${lang} gift: сцена меняет размер при выборе: ${[...seen].join(' | ')}`);
      }
      if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/shop-${state}.png` });
    }
  }
  // Касание своего Знамения — лист с бонусом и «Продать»
  await open(page, 'ru', 'mid');
  await page.locator('.owned-omen:not(.empty) .omen-slot').first().click();
  await expect(page.locator('.owned-omen-sheet')).toBeVisible();
  await expect(page.locator('.owned-omen-sheet .btn').first()).toContainText('Продать');
  expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Баг 0.5.0: после покупки Знамения хит-зоны кнопок цены растягивались на весь раздел и
 * накрывали следующие Знамения, а подсказка первых забегов ловила свайп — купить второе
 * Знамение было нельзя. Проверяем: после покупки каждая кнопка цены получает своё касание,
 * второе Знамение покупается, под подсказкой — прокручиваемый список.
 */
test('Обсерватория: после покупки Знамения можно купить второе', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: { profile: Record<string, unknown>; run: Record<string, unknown>; runs: { startRun(s: string): void; collectReward(): void } } }).starweave;
    Object.assign(a.profile, { tutorialDone: true, runs: 0, tutorial: [] });
    a.runs.startRun('classic');
    await new Promise((r) => setTimeout(r, 300));
    Object.assign(a.run, { gold: 30, phase: 'reward', reward: { base: 3, moves: 0, burns: 0, interest: 0, total: 3 }, night: null });
    a.runs.collectReward();
  });
  await page.waitForSelector('.shop');
  await page.waitForTimeout(900);
  const omens = () => page.evaluate(() => (window as unknown as { starweave: { run: { omens: unknown[] } } }).starweave.run.omens.length);
  await page.locator('[data-shop="omens"] .btn.price').first().click();
  await page.waitForTimeout(700);
  expect(await omens()).toBe(1);
  const hits = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.ware .btn.price')].map((b) => {
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el === b || b.contains(el) ? '' : b.getAttribute('aria-label') ?? '?';
  }).filter(Boolean));
  expect(hits, 'кнопки цены, касание которых уходит другому элементу').toEqual([]);
  await page.locator('[data-shop="omens"] .btn.price').first().click();
  await page.waitForTimeout(700);
  expect(await omens(), 'второе Знамение куплено').toBe(2);
  const under = await page.evaluate(() => {
    const c = document.querySelector('.coach-text')?.getBoundingClientRect();
    return c ? document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)?.closest('.shop') ? 'shop' : 'coach' : 'none';
  });
  expect(under, 'касание по тексту подсказки уходит экрану').not.toBe('coach');
  expect(errors).toEqual([]);
});

/**
 * FX.1: после Яркой ночи в очереди два выбора — дар ночи и бесплатное Знамение. Взял дар
 * (или пропустил) — сразу открывается выбор Знамения, а после него «Следующая ночь» ведёт
 * дальше. Раньше окно Знамения появлялось только после выхода в меню и «Продолжить».
 */
test('после Яркой ночи: дар, затем бесплатное Знамение, затем дальше', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  for (const way of ['skip', 'take']) {
    await page.evaluate(async () => {
      const { planChapter, chooseRoute } = await import('/src/core/route.ts');
      const app = (window as unknown as { starweave: App }).starweave;
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      Object.assign(app.profile, { tutorialDone: true, runs: 12 });
      app.runs.startRun('classic', false, 0, 4242);
      await new Promise((r) => setTimeout(r, 300));
      type Run = { unlocks: { routes: boolean; wonders: boolean }; chapter: { nodes: { route: string }[] }; phase: string; reward: unknown; night: unknown };
      const run = app.run as never as Run;
      run.unlocks.routes = true;
      run.unlocks.wonders = false;
      run.chapter = planChapter(run as never) as never;
      chooseRoute(run as never, run.chapter.nodes.findIndex((n) => n.route === 'bright'));
      run.phase = 'reward';
      run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
      run.night = null;
      app.runs.collectReward();
    });
    await expect(page.locator('.gift-scene').first()).toBeVisible();
    // Карты раздаются ~1,7 с, до этого сцена кнопки не принимает
    await page.waitForTimeout(2500);
    if (way === 'take') {
      // Веер дара дышит — Playwright не дождётся «стабильного» элемента, жмём сразу
      await page.locator('.gift-card').first().dispatchEvent('click');
      await expect(page.locator('.gift-take')).toBeEnabled();
      await page.locator('.gift-take').dispatchEvent('click');
    } else await page.locator('.gift-scene button', { hasText: /Clear sky|Чистое небо/ }).dispatchEvent('click');
    // Следующий выбор открывается сам — без выхода в меню
    await expect(page.locator('.pack-scene')).toBeVisible({ timeout: 4000 });
    await page.locator('.pack-scene .take').first().click();
    await expect(page.locator('.pack-scene')).toHaveCount(0, { timeout: 3000 });
    await page.locator('[data-shop="next"]').click();
    await page.waitForTimeout(600);
    const phase = await page.evaluate(() => ((window as unknown as { starweave: App }).starweave.run as { phase: string }).phase);
    expect(phase, way).toBe('map');
  }
  expect(errors).toEqual([]);
});
