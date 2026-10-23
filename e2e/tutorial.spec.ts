import { expect, test, type Page } from '@playwright/test';

/**
 * Обучение — «Нить к цели» (RD.9). На каждом устройстве проходим начало сценария: обзор,
 * четыре карты в ряд, «почти линия». На каждом шаге подсказка в пределах экрана, не
 * закрывает цель (подсвеченную клетку) и руку, нить ведёт к цели. В конце — окно
 * «Обучение пройдено»: кнопки по своей ширине, не растянуты на широком экране.
 */
test.use({ locale: 'ru-RU' });

type Rect = { x: number; y: number; w: number; h: number };
type W = {
  starweave: { runs: { startTutorial(): void }; run: { night: { hand: { rank: number; suit: string }[] } } };
  __scene: { busy: boolean; place(h: number, c: number): Promise<void>; handAreaRect(): Rect };
};
const SUIT: Record<string, string> = { s: 'sun', m: 'moon', t: 'star', c: 'comet' };

async function check(page: Page, step: string, failures: string[]): Promise<void> {
  await page.waitForTimeout(700);
  const res = await page.evaluate(() => {
    const out: string[] = [];
    const w = window as unknown as W;
    const b = document.querySelector('.tut-bubble.on')!.getBoundingClientRect();
    if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push('подсказка за экраном');
    // Всё содержимое подсказки — внутри неё (кнопка «Далее» не уезжает за край)
    for (const el of document.querySelectorAll('.tut-bubble.on .tut-actions > *')) {
      const r = el.getBoundingClientRect();
      if (r.right > b.right + 1 || r.left < b.left - 1) out.push(`вылезает из подсказки: ${el.className || el.tagName}`);
    }
    const hit = (r: { left: number; right: number; top: number; bottom: number }) => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom);
    const spot = document.querySelector('.tut-spot.on');
    // Цель — клетка или «Сжечь»; обзор (небо вместе с рукой) не считаем
    if (spot) {
      const s = spot.getBoundingClientRect();
      if (s.height < innerHeight * 0.5 && hit(s)) out.push('подсказка на цели');
      if (!document.querySelector('.tut-thread path')) out.push('нет нити к цели');
    }
    const hand = w.__scene.handAreaRect();
    if (hit({ left: hand.x, right: hand.x + hand.w, top: hand.y, bottom: hand.y + hand.h })) out.push('подсказка на руке');
    return out;
  });
  if (res.length) failures.push(`${step}: ${res.join('; ')}`);
}

async function place(page: Page, code: string, cell: number): Promise<void> {
  await page.evaluate(async ({ rank, suit, cell }) => {
    const w = window as unknown as W;
    const i = w.starweave.run.night.hand.findIndex((c) => c.rank === rank && c.suit === suit);
    await w.__scene.place(i, cell);
  }, { rank: Number(code.slice(0, -1)), suit: SUIT[code.slice(-1)]!, cell });
  await page.waitForFunction(() => !(window as unknown as W).__scene.busy, null, { timeout: 15_000 });
}

test('обучение: нить к цели, подсказка не закрывает цель и руку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => (window as unknown as W).starweave.runs.startTutorial());
  await page.waitForSelector('.tut-bubble.on', { timeout: 10_000 });
  const failures: string[] = [];
  await check(page, 'обзор', failures);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/32-tut-board.png` });
  await page.click('.tut-next:not(.ghost)');
  const steps: [string, number][] = [['3s', 12], ['3m', 13], ['7t', 14]];
  for (const [i, [code, cell]] of steps.entries()) {
    await page.waitForSelector('.tut-bubble.on');
    await check(page, `карта ${i + 1}`, failures);
    if (i === 0) await page.screenshot({ path: `e2e-results/${test.info().project.name}/33-tut-place.png` });
    await place(page, code, cell);
  }
  await page.waitForSelector('.tut-bubble.on .tut-next:not(.ghost)');
  await check(page, 'почти линия', failures);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/34-tut-almost.png` });

  // Формула подсчёта (TU.3): подсказка над линией без нити через экран, не закрывает ни
  // линию, ни формулу; под формулой — база Пары и фишки четырёх карт
  await page.click('.tut-next:not(.ghost)');
  await page.waitForSelector('.tut-bubble.on');
  // Подсчёт ждёт «Далее» — не ждём конца хода
  await page.evaluate(() => {
    const w = window as unknown as W;
    const i = w.starweave.run.night.hand.findIndex((c) => c.rank === 5 && c.suit === 'comet');
    void w.__scene.place(i, 15);
  });
  await page.waitForSelector('.calc.show');
  await page.waitForSelector('.tut-bubble.on .tut-next:not(.ghost)');
  await page.waitForTimeout(700);
  const formula = await page.evaluate(() => {
    const w = window as unknown as W & { __scene: { cellsRect(c: number[]): Rect } };
    const b = document.querySelector('.tut-bubble.on')!.getBoundingClientRect();
    const hit = (r: { left: number; right: number; top: number; bottom: number }) => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom);
    const line = w.__scene.cellsRect([12, 13, 14, 15]);
    return {
      thread: !!document.querySelector('.tut-thread path'),
      onLine: hit({ left: line.x, right: line.x + line.w, top: line.y, bottom: line.y + line.h }),
      onCalc: hit(document.querySelector('.calc')!.getBoundingClientRect()),
      onHand: ((r) => hit({ left: r.x, right: r.x + r.w, top: r.y, bottom: r.y + r.h }))(w.__scene.handAreaRect()),
      parts: [...document.querySelectorAll('.calc-part')].map((e) => e.textContent),
      dim: document.querySelectorAll('.calc-part.dim').length,
    };
  });
  expect(formula).toEqual({ thread: false, onLine: false, onCalc: false, onHand: false, parts: ['база: Пара10×2', '+3', '+3', '+7', '+5'], dim: 4 });
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/34b-tut-formula.png` });
  // После «Далее» фишки карт загораются по очереди
  await page.click('.tut-bubble.on .tut-next:not(.ghost)');
  await page.waitForFunction(() => document.querySelectorAll('.calc-part.dim').length === 0, null, { timeout: 20_000 });
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/34c-tut-parts.png` });
  expect(failures).toEqual([]);

  // «Обучение пройдено»: кнопки по своей ширине
  await page.evaluate(async () => {
    document.querySelectorAll('.tut-layer').forEach((e) => e.remove());
    const { showTutorialDone } = await import('/src/ui/screens/tutorial-done.ts');
    showTutorialDone((window as unknown as { starweave: never }).starweave);
  });
  await page.waitForSelector('.tut-done .tut-chain');
  await page.waitForTimeout(900);
  const done = await page.evaluate(() => {
    const p = document.querySelector('.modal-panel.tut-done')!.getBoundingClientRect();
    const btns = [...document.querySelectorAll<HTMLElement>('.tut-done-acts .btn')].map((b) => b.getBoundingClientRect().width);
    return { panel: p.width, widest: Math.max(...btns), center: p.left + p.width / 2, vw: innerWidth };
  });
  expect(done.widest, 'кнопка не растянута').toBeLessThan(300);
  expect(Math.abs(done.center - done.vw / 2), 'окно по центру').toBeLessThan(2);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/35-tut-done.png` });
  expect(errors).toEqual([]);
});

test('«Пропустить» не встаёт на место «Далее»; пропуск в Обсерватории бережёт золото и пройденное (CQ.2)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => (window as unknown as W).starweave.runs.startTutorial());

  // «Пропустить» от правого края подсказки: с «Далее» и без неё — одно и то же место
  const skipAt = () => page.evaluate(() => {
    const r = document.querySelector('.tut-bubble.on .tut-skip')!.getBoundingClientRect();
    return Math.round(document.querySelector('.tut-bubble.on')!.getBoundingClientRect().right - r.right);
  });
  await firstNight(page);
  await page.waitForSelector('.btn.tut-allow', { timeout: 30_000 });
  await page.click('.btn.tut-allow');

  // Обсерватория: шаг с «Далее», затем «купи Знамение» — без неё
  await page.waitForSelector('.tut-bubble.on .tut-next:not(.ghost)', { timeout: 20_000 });
  await page.waitForTimeout(400);
  const before = await skipAt();
  await next(page);
  await page.waitForSelector('[data-shop="omen-0"] .btn.tut-allow');
  await page.waitForTimeout(400);
  expect(await page.locator('.tut-bubble.on .tut-next.ghost').count(), 'место «Далее» занято пустышкой').toBe(1);
  expect(await skipAt(), '«Пропустить» не съехало').toBe(before);

  const gold = await page.evaluate(() => (window as unknown as { starweave: { run: { gold: number; reward?: { total: number } } } }).starweave.run.gold);
  await page.click('.tut-bubble.on .tut-skip');
  await page.waitForSelector('.menu-buttons .btn');
  const profile = await page.evaluate(() => (window as unknown as { starweave: { profile: { tutorial: string[]; tutorialGift?: { gold: number } } } }).starweave.profile);
  expect(profile.tutorialGift?.gold ?? 0, 'золото обучения ждёт первого забега').toBeGreaterThanOrEqual(gold);
  expect(profile.tutorial, 'пройденное в обучении не повторяется').toEqual(expect.arrayContaining(['place', 'fillLine', 'target', 'combos', 'burn', 'cross', 'shop']));
  expect(errors).toEqual([]);
});

test('первый запуск с quickStart: без меню сразу обучение, после первой ночи сразу забег (CQ.3)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  type P = { starweave: { run: { tutorial?: boolean; phase: string; ante: number; gold: number } | null; profile: { tutorialDone: boolean; tutorialFinished?: boolean; tutorial: string[]; tutorialGift?: { gold: number } } } };
  await page.goto('/?ff=quickStart');
  // Меню не показывается: первым на экране — обучение
  await page.waitForSelector('.tut-bubble.on', { timeout: 20_000 });
  expect(await page.locator('.menu-buttons').count(), 'меню не открывалось').toBe(0);
  await firstNight(page);
  await page.waitForSelector('.btn.tut-allow', { timeout: 30_000 });
  // Полоса прогресса к концу ночи заполнена: обучение — одна ночь
  const ticks = await page.evaluate(() => [document.querySelectorAll('.tut-ticks i.on').length, document.querySelectorAll('.tut-ticks i').length]);
  expect(ticks[0], 'полоса обучения заполнена').toBe(ticks[1]);
  await page.click('.btn.tut-allow');
  await page.waitForSelector('.tut-done .tut-chain');
  const done = await page.evaluate(() => ({
    steps: document.querySelectorAll('.tut-chain > span').length,
    gift: !!document.querySelector('.tut-gift'),
    shop: document.querySelector('.shop-screen, [data-shop]') !== null,
  }));
  expect(done, 'четыре приёма, золото с собой, Обсерватории не было').toEqual({ steps: 4, gift: true, shop: false });
  const gift = await page.evaluate(() => (window as unknown as P).starweave.profile.tutorialGift!.gold);
  await page.click('.tut-done-acts .btn:last-child');
  await page.waitForSelector('.hud');
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const a = (window as unknown as P).starweave;
    return { tutorial: !!a.run?.tutorial, phase: a.run?.phase, ante: a.run?.ante, gold: a.run?.gold ?? 0, done: a.profile.tutorialDone, finished: !!a.profile.tutorialFinished, shopHint: a.profile.tutorial.includes('shop') };
  });
  expect(state, 'первая ночь настоящего забега; подсказка Обсерватории ещё впереди').toMatchObject({ tutorial: false, phase: 'night', ante: 1, done: true, finished: false, shopHint: false });
  expect(state.gold).toBeGreaterThanOrEqual(gift);
  expect(errors).toEqual([]);
});

test('первый запуск с quickStart: «Пропустить» ведёт в первую ночь, а не в меню (CQ.3)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?ff=quickStart');
  await page.waitForSelector('.tut-bubble.on .tut-skip', { timeout: 20_000 });
  await page.click('.tut-bubble.on .tut-skip');
  await page.waitForSelector('.hud');
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const a = (window as unknown as { starweave: { run: { tutorial?: boolean; phase: string } | null } }).starweave;
    return { tutorial: !!a.run?.tutorial, phase: a.run?.phase, menu: !!document.querySelector('.menu-buttons') };
  });
  expect(state).toEqual({ tutorial: false, phase: 'night', menu: false });
  // Перезагрузка: уже не первый запуск — сохранённый забег, а не обучение заново
  await page.reload();
  await page.waitForSelector('.menu-buttons .btn');
  expect(await page.locator('.tut-bubble.on').count()).toBe(0);
  expect(errors).toEqual([]);
});

/** Нажать «Далее» в подсказке, когда она появится. */
async function next(page: Page): Promise<void> {
  await page.waitForSelector('.tut-bubble.on .tut-next:not(.ghost)', { timeout: 20_000 });
  await page.click('.tut-bubble.on .tut-next:not(.ghost)');
}

test('обучение до второй ночи: награда без подсказки, Знамение не закрыто (TU.1, TU.2)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => (window as unknown as W).starweave.runs.startTutorial());
  const failures: string[] = [];
  const dir = `e2e-results/${test.info().project.name}`;

  await firstNight(page);

  // Награда: подсказки и нити нет, светится только «Забрать»
  await page.waitForSelector('.btn.tut-allow', { timeout: 30_000 });
  await page.waitForTimeout(700);
  const reward = await page.evaluate(() => ({
    bubble: !!document.querySelector('.tut-bubble.on'),
    thread: !!document.querySelector('.tut-thread path'),
    spot: !!document.querySelector('.tut-spot.on'),
  }));
  expect(reward, 'на итогах ночи только кнопка').toEqual({ bubble: false, thread: false, spot: false });
  await page.screenshot({ path: `${dir}/36-tut-reward.png` });
  await page.click('.btn.tut-allow');

  // Обсерватория: купить Знамение и уйти в ночь
  await next(page);
  await page.waitForSelector('[data-shop="omen-0"] .btn.tut-allow');
  await page.click('[data-shop="omen-0"] .btn.tut-allow');
  await next(page);
  await page.waitForSelector('[data-shop="next"].tut-allow');
  // Своё Знамение не открывает лист продажи посреди шага
  const omenBox = (await page.locator('.owned-omen:not(.empty)').first().boundingBox())!;
  await page.mouse.click(omenBox.x + omenBox.width / 2, omenBox.y + omenBox.height / 2);
  await page.waitForTimeout(400);
  expect(await page.locator('.owned-omen-sheet').count(), 'лист Знамения не открылся').toBe(0);
  await page.click('[data-shop="next"].tut-allow');

  // Ночь 2: подсказка не на Знамении
  await page.waitForFunction(() => document.querySelector('.tut-bubble.on')?.textContent?.includes('Знамение —'), null, { timeout: 30_000 });
  await check(page, 'Знамение наверху', failures);
  const onOmens = await page.evaluate(() => {
    const s = document.querySelector('.tut-spot.on')!.getBoundingClientRect();
    const o = document.querySelector('.hud-omens')!.getBoundingClientRect();
    return s.left <= o.left && s.top <= o.top && s.right >= o.right && s.bottom >= o.bottom;
  });
  expect(onOmens, 'рамка — на Знамениях').toBe(true);
  await page.screenshot({ path: `${dir}/37-tut-omen.png` });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

/** Первая ночь обучения: обзор, Пара, формула, сжигание, крест — до окна награды. */
async function firstNight(page: Page): Promise<void> {
  await next(page); // обзор
  // Шапка ночи заперта: «?», меню и колода не открываются посреди шага
  const hudLocked = await page.evaluate(() => ['.icon-btn.q', '.hud .icon-btn.medal:not(.q)', '.deck-btn'].map((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  }));
  expect(hudLocked, '«?», меню и колода не нажимаются').toEqual([false, false, false]);
  for (const [code, cell] of [['3s', 12], ['3m', 13], ['7t', 14]] as const) {
    await page.waitForSelector('.tut-bubble.on');
    await place(page, code, cell);
  }
  await next(page); // почти линия
  // Первый подсчёт ждёт «Далее» у формулы
  await page.evaluate(() => {
    const w = window as unknown as W;
    const i = w.starweave.run.night.hand.findIndex((c) => c.rank === 5 && c.suit === 'comet');
    void w.__scene.place(i, 15);
  });
  await page.waitForSelector('.calc.show');
  await next(page);
  await page.waitForFunction(() => !(window as unknown as W).__scene.busy, null, { timeout: 20_000 });
  await next(page); // цель
  await next(page); // «?»
  // Сжечь единицу
  await page.waitForSelector('.tut-bubble.on');
  await page.evaluate(async () => {
    const w = window as unknown as W & { __scene: { select(i: number): void; burnSelected(): Promise<void> } };
    w.__scene.select(w.starweave.run.night.hand.findIndex((c) => c.rank === 1 && c.suit === 'moon'));
    await w.__scene.burnSelected();
  });
  await next(page); // главный приём — дальше раскладывает сам
  await page.waitForFunction(() => document.querySelector('.tut-bubble.on')?.textContent?.includes('Комет'), null, { timeout: 30_000 });
  await place(page, '4c', 15);
  await next(page); // клетка ×2
  await page.waitForSelector('.tut-bubble.on');
  await place(page, '9t', 3);
}
