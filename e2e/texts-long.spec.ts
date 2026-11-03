import { expect, test, type Page } from '@playwright/test';
import { maxTextLength, textCatalog } from '../src/i18n/texts.ts';

/**
 * Тексты обучения с сервера (TX.6): Денис может удлинить любую реплику до предела, который
 * пропускает редактор. Подкладываем в игру самые длинные допустимые тексты (как будто они уже
 * пришли с сервера) и проверяем, что пузыри «Нити», подсказки, «Проводник», пролог пути и
 * «Обучение пройдено» остаются в экране и не закрывают цель, а *действие* по-прежнему выделено.
 */
test.use({ locale: 'ru-RU' });

/** Метка: по ней видно, что на экране текст с сервера, а не из сборки. */
const MARK = 'звездопад';
const FILL = [MARK, 'и', 'тихий', 'свет', 'над', 'небом', 'до', 'самого', 'рассвета'];

/** Текст по умолчанию, дополненный словами до предела длины. */
function longest(def: string): string {
  const max = maxTextLength(def);
  let out = def;
  for (let i = 0; ; i++) {
    const next = `${out} ${FILL[i % FILL.length]}`;
    if (next.length > max) return out;
    out = next;
  }
}

const LONG = Object.fromEntries(textCatalog('ru').map((e) => [e.key, longest(e.value)]));

type A = {
  profile: Record<string, unknown> & { tutorial: string[] };
  run: Record<string, unknown>;
  runs: { startRun(s: string): void; beginNight(): void; collectReward(): void; startTutorial(): void };
  router: { route(): Promise<void> };
};
type Box = { left: number; top: number; right: number; bottom: number };

async function boot(page: Page, query = ''): Promise<void> {
  await page.addInitScript((texts) => localStorage.setItem('starweave.texts.v1', JSON.stringify({ v: 'e2e-long', texts: { ru: texts } })), LONG);
  await page.goto(`/${query}`);
}

/** Пузырь в экране, не на цели, текст с сервера и действие выделено. */
async function bubbleOk(page: Page, where: string, sel = '.tut-bubble.on', spot = '.tut-spot.on'): Promise<string[]> {
  await page.waitForSelector(sel, { timeout: 20_000 });
  await page.waitForTimeout(700);
  return page.evaluate(({ where, sel, spot, mark }) => {
    const out: string[] = [];
    const el = document.querySelector(sel)!;
    const b = el.getBoundingClientRect();
    if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push(`${where}: пузырь за экраном`);
    for (const c of el.querySelectorAll('button, .btn')) {
      const r = c.getBoundingClientRect();
      if (r.width && (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 1)) out.push(`${where}: кнопка вылезает из пузыря`);
    }
    const s = document.querySelector(spot)?.getBoundingClientRect();
    const hit = (r: Box) => !(r.right <= b.left + 2 || r.left >= b.right - 2 || r.bottom <= b.top + 2 || r.top >= b.bottom - 2);
    if (s && s.height < innerHeight * 0.5 && hit(s)) out.push(`${where}: пузырь на цели`);
    if (!el.textContent?.includes(mark)) out.push(`${where}: текст не с сервера`);
    return out;
  }, { where, sel, spot, mark: MARK });
}

test('самые длинные тексты с сервера: обучение, подсказки, Обсерватория, путь (TX.6)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const failures: string[] = [];

  // Короткое обучение: первая реплика Лебедя — цель ночи и первое действие
  await boot(page, '?ff=quickStart,shortTutorial');
  failures.push(...(await bubbleOk(page, 'первая реплика')));
  expect(await page.locator('.tut-bubble.on .tut-act').count(), 'действие выделено').toBeGreaterThan(0);
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-first.png` });

  // Полное обучение: обзор и первая карта
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => (window as unknown as { starweave: A }).starweave.runs.startTutorial());
  failures.push(...(await bubbleOk(page, 'обзор')));
  await page.click('.tut-next:not(.ghost)');
  failures.push(...(await bubbleOk(page, 'первая карта')));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-place.png` });

  // «Обучение пройдено»: звенья цепочки и кнопки внутри окна
  await page.evaluate(async () => {
    document.querySelectorAll('.tut-layer').forEach((e) => e.remove());
    const { showTutorialDone } = await import('/src/ui/screens/tutorial-done.ts');
    showTutorialDone((window as unknown as { starweave: never }).starweave);
  });
  await page.waitForSelector('.tut-done .tut-chain');
  await page.waitForTimeout(900);
  const done = await page.evaluate(() => {
    const out: string[] = [];
    const p = document.querySelector('.modal-panel.tut-done')!.getBoundingClientRect();
    if (p.top < -1 || p.bottom > innerHeight + 1 || p.left < -1 || p.right > innerWidth + 1) out.push('окно за экраном');
    for (const el of document.querySelectorAll('.tut-chain > span, .tut-done-acts .btn')) {
      const r = el.getBoundingClientRect();
      if (r.left < p.left - 1 || r.right > p.right + 1) out.push(`вылезает: ${el.textContent?.slice(0, 20)}`);
    }
    return out;
  });
  failures.push(...done.map((d) => `«Обучение пройдено»: ${d}`));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-done.png` });

  // Подсказки первых забегов на ночи
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  for (const step of ['place', 'cross', 'burn']) {
    await page.evaluate(async (step) => {
      const a = (window as unknown as { starweave: A }).starweave;
      Object.assign(a.profile, { tutorial: ['runPath'], runs: 0, tutorialDone: true, tutorialFinished: false });
      const { coach, clearCoach } = await import('/src/ui/tutorial.ts');
      clearCoach();
      if (!document.querySelector('.hud')) {
        a.runs.startRun('classic');
        await new Promise((r) => setTimeout(r, 300));
        a.runs.beginNight();
        await new Promise((r) => setTimeout(r, 2500));
      }
      document.querySelectorAll('.toast').forEach((e) => e.remove());
      coach(a as never, step as never);
    }, step);
    failures.push(...(await bubbleOk(page, `подсказка ${step}`, '.coach', '.coach-ring.on')));
  }
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-coach.png` });

  // Первый заход в Обсерваторию: «Проводник»
  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    const { clearCoach } = await import('/src/ui/tutorial.ts');
    clearCoach();
    Object.assign(a.profile, { tutorial: ['runPath'], runs: 0, tutorialDone: true, tutorialFinished: false });
    Object.assign(a.run, { gold: 12, phase: 'reward', reward: { base: 0, moves: 0, burns: 0, interest: 0, total: 0 }, night: null });
    a.runs.collectReward();
  });
  await page.waitForSelector('.shop');
  failures.push(...(await bubbleOk(page, 'Обсерватория')));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-shop.png` });

  // Пролог пути: окно в экране, «В путь» видна
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorial: [], runs: 0, tutorialDone: true, tutorialFinished: false });
    a.runs.startRun('classic');
  });
  await page.waitForSelector('.run-prologue .btn');
  await page.waitForTimeout(500);
  const prologue = await page.evaluate((mark) => {
    const out: string[] = [];
    const p = document.querySelector('.modal-panel.run-prologue')!.getBoundingClientRect();
    const go = document.querySelector('.run-prologue .btn')!.getBoundingClientRect();
    if (p.top < -1 || p.bottom > innerHeight + 1) out.push('окно за экраном');
    if (go.bottom > innerHeight + 1 || go.bottom > p.bottom + 1) out.push('«В путь» за краем');
    if (!document.querySelector('.run-prologue')!.textContent?.includes(mark)) out.push('текст не с сервера');
    return out;
  }, MARK);
  failures.push(...prologue.map((d) => `пролог пути: ${d}`));
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/tx-long-prologue.png` });

  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('битые тексты с сервера не ломают обучение (TX.4)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('starweave.texts.v1', JSON.stringify({ v: 'bad', texts: { ru: { 'tut.shortRow': 'Без числа и *без пары', 'tut.next': '<b>x</b>' } } }));
  });
  await page.goto('/?ff=quickStart,shortTutorial');
  await page.waitForSelector('.tut-bubble.on .tut-act', { timeout: 20_000 });
  const text = await page.locator('.tut-bubble.on').textContent();
  expect(text, 'свой текст вместо битого').toContain('Звездочёт');
  expect(text).not.toContain('без пары');
  expect(errors).toEqual([]);
});
