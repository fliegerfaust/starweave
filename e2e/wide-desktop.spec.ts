import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Широкий ПК (CQ.5, `wideDesktop`): на широких окнах табло прижато к небу — вровень с его
 * верхом, кнопки вровень с низом; под табло созвездия, если помещаются целиком; ничего не
 * вылезает из плашек (fit-audit). Телефон боком раскладку не меняет.
 */
test.use({ locale: 'ru-RU' });
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

type A = {
  profile: Record<string, unknown>;
  runs: { startRun(sky: string, daily?: boolean, stake?: number, seed?: number): void; beginNight(): void };
};

async function night(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/?ff=wideDesktop');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorialDone: true, tutorialFinished: true, runs: 5, tutorial: ['place', 'target', 'fillLine', 'combos', 'cross', 'burn', 'shop', 'boss', 'guideSeen'] });
    a.runs.startRun('classic', false, 0, 777);
    await new Promise((r) => setTimeout(r, 300));
    a.runs.beginNight();
  });
  await page.waitForFunction(() => {
    const w = window as unknown as { __scene?: { busy: boolean }; starweave: { run: { night: { hand: unknown[] } } } };
    return !!w.__scene && !w.__scene.busy && w.starweave.run.night.hand.length === 4;
  }, null, { timeout: 20_000 });
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  await page.waitForTimeout(600);
}

for (const [w, h, combos] of [[907, 510, false], [1216, 684, true], [1366, 768, true], [1920, 1080, true]] as const) {
  test(`широкий ПК ${w}×${h}: табло у неба, созвездия, ничего не вылезает (CQ.5)`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'размеры окна задаёт сам тест');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await night(page, w, h);
    const m = await page.evaluate(() => {
      const s = (window as unknown as { __scene: { layout: { board: { x: number; y: number; w: number; h: number }; handX: number; handW: number } } }).__scene;
      const b = s.layout.board;
      const frame = document.querySelector('.hud-frame')!.getBoundingClientRect();
      const acts = document.querySelector('.actions')!.getBoundingClientRect();
      const list = document.querySelector('.hud-combos')!;
      const lr = list.getBoundingClientRect();
      return {
        wide: document.body.classList.contains('pc-wide'),
        gap: b.x - frame.right,
        topDiff: Math.abs(frame.top - b.y),
        bottomDiff: Math.abs(acts.bottom - (b.y + b.h)),
        handRight: s.layout.handX + s.layout.handW * 0.6,
        combos: getComputedStyle(list).display !== 'none' && lr.height > 0,
        combosOverActions: lr.height > 0 && lr.bottom > acts.top,
        vw: innerWidth,
      };
    });
    expect(m.wide, 'раскладка широкого ПК').toBe(true);
    expect(m.gap, 'табло прижато к небу').toBeGreaterThan(8);
    expect(m.gap).toBeLessThan(90);
    expect(m.topDiff, 'табло вровень с верхом неба').toBeLessThan(3);
    expect(m.bottomDiff, 'кнопки вровень с низом неба').toBeLessThan(3);
    expect(m.handRight, 'рука в окне').toBeLessThan(m.vw);
    expect(m.combos, combos ? 'созвездия под табло' : 'созвездия не влезают — колонка пустая').toBe(combos);
    expect(m.combosOverActions, 'созвездия не заходят на кнопки').toBe(false);
    expect(await page.evaluate(FIT_AUDIT), 'ничего не вылезает').toEqual([]);
    await page.screenshot({ path: `e2e-results/${info.project.name}/60-wide-${w}x${h}.png` });
    expect(errors).toEqual([]);
  });
}

test('телефон боком: раскладка широкого ПК не включается (CQ.5)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'только телефон в ландшафте');
  await page.goto('/?ff=wideDesktop');
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(async () => {
    const a = (window as unknown as { starweave: A }).starweave;
    Object.assign(a.profile, { tutorialDone: true, tutorialFinished: true, runs: 5 });
    a.runs.startRun('classic', false, 0, 777);
    await new Promise((r) => setTimeout(r, 300));
    a.runs.beginNight();
  });
  await page.waitForSelector('.hud');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.body.classList.contains('pc-wide'))).toBe(false);
});
