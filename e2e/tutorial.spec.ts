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
  starweave: { startTutorial(): void; run: { night: { hand: { rank: number; suit: string }[] } } };
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
  await page.evaluate(() => (window as unknown as W).starweave.startTutorial());
  await page.waitForSelector('.tut-bubble.on', { timeout: 10_000 });
  const failures: string[] = [];
  await check(page, 'обзор', failures);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/32-tut-board.png` });
  await page.click('.tut-next');
  const steps: [string, number][] = [['3s', 12], ['3m', 13], ['7t', 14]];
  for (const [i, [code, cell]] of steps.entries()) {
    await page.waitForSelector('.tut-bubble.on');
    await check(page, `карта ${i + 1}`, failures);
    if (i === 0) await page.screenshot({ path: `e2e-results/${test.info().project.name}/33-tut-place.png` });
    await place(page, code, cell);
  }
  await page.waitForSelector('.tut-bubble.on .tut-next');
  await check(page, 'почти линия', failures);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/34-tut-almost.png` });

  // Формула подсчёта: панель меряется по таймеру, а нить не пересоздаётся и не прыгает —
  // иначе пунктир дёргается (баг из обучения на iPhone)
  await page.click('.tut-next');
  await page.waitForSelector('.tut-bubble.on');
  // Подсчёт ждёт «Далее» — не ждём конца хода
  await page.evaluate(() => {
    const w = window as unknown as W;
    const i = w.starweave.run.night.hand.findIndex((c) => c.rank === 5 && c.suit === 'comet');
    void w.__scene.place(i, 15);
  });
  await page.waitForSelector('.calc.show');
  await page.waitForSelector('.tut-bubble.on .tut-next');
  const thread = await page.evaluate(async () => {
    const first = document.querySelector('.tut-thread path');
    const samples: string[] = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const dot = document.querySelector('.tut-thread circle');
      samples.push(`${dot?.getAttribute('cx')},${dot?.getAttribute('cy')}`);
    }
    return { same: !!first && document.querySelector('.tut-thread path') === first, ends: new Set(samples.slice(2)).size };
  });
  expect(thread.same, 'нить на шаге формулы не пересоздаётся').toBe(true);
  expect(thread.ends, 'конец нити стоит на месте').toBe(1);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/34b-tut-formula.png` });
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
