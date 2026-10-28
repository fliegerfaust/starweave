import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Замена Знамения при полном ряде (OB, отзыв Андрея 28.10, вариант Б — выбор Дениса 29.10): в
 * Обсерватории, в пакете Знамений и в окне трофея своё Знамение отдаётся касанием медали в ряду,
 * новое встаёт на его место. DEV-вход `?full=shop|pack|trophy`: 5/5 Знамений, 9 золота.
 */
type Run = { gold: number; omens: { id: string; uid: number }[]; pending: unknown[] };
const run = (page: Page) => page.evaluate(() => {
  const r = (window as unknown as { starweave: { run: Run } }).starweave.run;
  return { gold: r.gold, ids: r.omens.map((o) => o.id), pending: r.pending.length };
});
// Как в shop.spec: середина Обсерватории прокручивается — «за экраном» там не ошибка
const audit = async (page: Page, scrolls = true) => ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !(scrolls && p.includes('за экраном')) && !p.includes('shop-actions') && !p.includes('div.modal-head'));

/**
 * Рамки элементов экрана: при замене ничего не должно сдвигаться (правило Дениса «ничего не скачет»).
 * Только видимые блоки раскладки; подсветка, цены и пульс — слоями поверх, их не меряем.
 */
const RECT_SEL = '.shop-top, .ware, .ware .btn, .shop-section, .shop-label-row, .owned-omen, .shop-owned > .hint, .shop-deck, .shop-actions .btn, .pack-scene .ware, .give-strip, .give-strip .owned-omen, .scene-light, .ts-card, .ts-give, .ts-go, .ts-note';
const rects = (page: Page) => page.evaluate((sel) => {
  // Конечное положение, не середина перехода
  const st = document.createElement('style');
  st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
  document.head.append(st);
  const out = [...document.querySelectorAll<HTMLElement>(sel)].map((el, i) => {
    const r = el.getBoundingClientRect();
    return `${i}:${el.className}:${Math.round(r.x * 2) / 2},${Math.round(r.y * 2) / 2},${Math.round(r.width * 2) / 2},${Math.round(r.height * 2) / 2}`;
  });
  st.remove();
  return out;
}, RECT_SEL);
/** Сравнить без классов состояния (giving, give, on, picked): важны только места. */
const places = (list: string[]) => list.map((x) => x.replace(/:[^:]*:/, ':'));

async function open(page: Page, where: string): Promise<void> {
  await page.goto(`/?full=${where}`);
  await page.waitForFunction(() => !!(window as unknown as { starweave?: { run?: unknown } }).starweave?.run);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.feat-toast').forEach((e) => e.remove()));
}

test('Обсерватория: «Заменить» подсвечивает свой ряд, касание медали — замена на том же месте', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'shop');
  const before = await run(page);
  expect(before.ids).toHaveLength(5);
  // Астролог за 12 при 9 золота: хватает только с продажей Совы (+3)
  await page.locator('.shop-owned').scrollIntoViewIfNeeded();
  const still = await rects(page);
  // Клик без автопрокрутки Playwright: иначе он сам двигает список к кнопке
  await page.locator('.ware .btn.price.replace').nth(1).evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(300);
  // Ничего не сдвинулось: ни товары, ни ряд, ни подсказка, ни колода, ни кнопки
  expect(places(await rects(page))).toEqual(places(still));
  await expect(page.locator('.shop-owned.giving')).toBeVisible();
  await expect(page.locator('.owned-omen.give .give-badge')).toHaveCount(5);
  expect(await page.locator('.owned-omen.give.short').count()).toBe(4);
  expect(await audit(page)).toEqual([]);
  // «Отмена» возвращает ряд как был
  await page.locator('.give-cancel').evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator('.shop-owned.giving')).toHaveCount(0);
  expect(places(await rects(page))).toEqual(places(still));
  await page.locator('.ware .btn.price.replace').nth(1).click();
  await page.locator('.owned-omen.give .omen-slot').nth(4).click();
  await page.waitForTimeout(400);
  const after = await run(page);
  expect(after.ids).toEqual([...before.ids.slice(0, 4), 'astrologer']);
  expect(after.gold).toBe(0);
  expect(await audit(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Пакет Знамений: при полном ряде «Заменить» и свой ряд внизу сцены', async ({ page }) => {
  await open(page, 'pack');
  const before = await run(page);
  const still = await rects(page);
  await page.locator('.pack-scene .btn.take').nth(1).click();
  await expect(page.locator('.give-strip.on')).toBeVisible();
  await page.waitForTimeout(300);
  expect(places(await rects(page))).toEqual(places(still));
  // Ряд в нижней панели сцены: виден целиком на любом экране
  expect((await audit(page, false)).filter((p) => p.includes('give-strip') || p.includes('omen-slot'))).toEqual([]);
  await page.locator('.give-strip .omen-slot').nth(0).click();
  await page.waitForTimeout(500);
  const after = await run(page);
  expect(after.ids[0]).toBe('moonTide');
  expect(after.ids.slice(1)).toEqual(before.ids.slice(1));
  expect(after.gold).toBeGreaterThan(before.gold);
});

test('Трофей Затмения: Знамение берётся заменой, кнопка ждёт выбора своего', async ({ page }) => {
  await open(page, 'trophy');
  await page.waitForSelector('.ts-card[data-k="omen"]');
  await page.waitForTimeout(3500);
  const still = await rects(page);
  await page.locator('.ts-card[data-k="omen"]').click();
  await expect(page.locator('.ts-give.on')).toBeVisible();
  await page.waitForTimeout(300);
  expect(places(await rects(page))).toEqual(places(still));
  await expect(page.locator('.ts-go')).toBeDisabled();
  expect((await audit(page, false)).filter((p) => p.includes('ts-give') || p.includes('omen-slot') || p.includes('ts-go'))).toEqual([]);
  await page.locator('.ts-give .omen-slot').nth(2).click();
  await expect(page.locator('.ts-go')).toBeEnabled();
  expect(places(await rects(page))).toEqual(places(still));
  const before = await run(page);
  await page.locator('.ts-go').click();
  await page.waitForTimeout(600);
  const after = await run(page);
  expect(after.ids).toHaveLength(5);
  expect(after.ids[2]).not.toBe(before.ids[2]);
  expect(after.pending).toBe(0);
});
