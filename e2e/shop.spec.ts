import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Обсерватория «Прилавок» (RD.4). На каждом устройстве и обоих языках: глава III, первая
 * глава, все места заняты и открытый пакет. Проверяем, что ничего не вылезает; на телефоне
 * товары и свои Знамения — над нижней панелью (если по высоте помещаются), в ландшафте строки
 * не заходят под панель, на ПК лавка — собранный блок без пустого поля (правило Дениса:
 * место на экране используется рационально); касание своего Знамения открывает лист продажи.
 */
type App = { profile: { tutorialDone: boolean; runs: number }; run: Record<string, unknown> & { shop: Record<string, unknown> }; startRun(s: string, daily?: boolean, stake?: number, seed?: number): void; collectReward(): void; route(): Promise<void> };

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
    app.startRun('classic', false, 0, 4242);
    await new Promise((r) => setTimeout(r, 300));
    const run = app.run as never as { ante: number; gold: number; omens: unknown[]; phase: string; reward: unknown; night: unknown; shop: { openPack: unknown } };
    run.ante = state === 'new' ? 1 : 3;
    run.gold = state === 'full' ? 23 : 14;
    const ids = state === 'full' ? ['horizon', 'corona', 'stardust', 'pyre', 'abacus'] : state === 'new' ? [] : ['horizon', 'pyre', 'stardust'];
    run.omens = ids.map((id) => createOmen(run as never, id));
    run.phase = 'reward';
    run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    run.night = null;
    app.collectReward();
    await new Promise((r) => setTimeout(r, 300));
    if (state === 'pack') {
      app.run.shop.openPack = { pack: 'omen', options: ['twinStars', 'crossroads', 'abacus'] };
      await app.route();
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
    for (const state of ['mid', 'new', 'full', 'pack']) {
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
      if (!res.shown) failures.push(`${tag}: пакет не открылся`);
      if (res.out.length) failures.push(`${tag}: ${res.out.slice(0, 3).join('; ')}`);
      if (audit.length) failures.push(`${tag}: ${audit.slice(0, 3).join('; ')}`);
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
