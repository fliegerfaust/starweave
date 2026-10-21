import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/game/app';
import type { NightScene } from '../src/game/night/scene';

/**
 * Страховка рефакторинга (TD.10): сохранение прошлой версии продолжается в живой игре, у
 * каждой фазы свой экран, а презентер подписывает подсчёт так же, как раньше. Дело в
 * логике, а не в вёрстке, — одного устройства достаточно.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'одного устройства достаточно');
});

type W = { starweave: App; __scene?: NightScene };
const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8').trim();

async function boot(page: Page, run?: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ run, profile }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('starweave.profile.v1', profile);
    localStorage.setItem('starweave.settings.v1', JSON.stringify({ lang: 'ru' }));
    if (run) localStorage.setItem('starweave.run.v1', run);
  }, { run, profile: JSON.stringify({ version: 1, runs: 3, tutorialDone: true, tutorial: ['map', 'shop', 'night', 'target', 'boss', 'guideSeen'] }) });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).starweave && !!document.querySelector('.menu-buttons .btn'));
  return errors;
}

test('сохранение 0.5.9 посреди ночи продолжается и играется', async ({ page }) => {
  const errors = await boot(page, fixture('save-0.5.9-night.json'));
  await page.locator('.menu-primary').click();
  await page.waitForFunction(() => !!(window as unknown as W).__scene && !(window as unknown as W).__scene!.busy);
  await expect(page.locator('.hud-title-wrap')).toContainText('Полночь');
  const res = await page.evaluate(async () => {
    const w = window as unknown as W;
    const app = w.starweave;
    const scene = w.__scene!;
    const before = app.run!.night!.movesLeft;
    const cell = app.run!.night!.grid.findIndex((c, i) => !c && !app.run!.night!.sealed[i]);
    await scene.place(0, cell);
    const saved = JSON.parse(localStorage.getItem('starweave.run.v1')!) as { version: number; chapter: { at: number }; log?: unknown };
    return { before, after: app.run!.night!.movesLeft, version: saved.version, at: saved.chapter.at, log: 'log' in saved };
  });
  expect(res).toEqual({ before: 15, after: 14, version: 5, at: 1, log: false });
  expect(errors).toEqual([]);
});

test('у каждой фазы забега свой экран, незнакомая — меню', async ({ page }) => {
  const errors = await boot(page);
  const screens = await page.evaluate(async () => {
    const app = (window as unknown as W).starweave;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const name = () => (app.router as unknown as { screen: object | null }).screen?.constructor.name;
    const out: Record<string, string | undefined> = {};
    app.runs.startRun('classic', false, 0, 4242);
    await sleep(300);
    out.map = name();
    app.runs.beginNight();
    await sleep(300);
    out.night = name();
    const run = app.run!;
    for (const phase of ['reward', 'gameOver', 'victory'] as const) {
      document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
      run.phase = phase;
      if (phase === 'reward') run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
      await app.router.route();
      await sleep(200);
      out[phase] = name();
    }
    document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
    run.phase = 'reward';
    app.runs.collectReward();
    await sleep(300);
    out.shop = name();
    (run as { phase: string }).phase = 'future';
    await app.router.route();
    await sleep(300);
    out.future = name();
    return out;
  });
  expect(screens).toEqual({
    map: 'MapScreen',
    night: 'NightScreen',
    reward: 'NightScreen',
    gameOver: 'NightScreen',
    victory: 'NightScreen',
    shop: 'ShopScreen',
    future: 'MenuScreen',
  });
  // Незнакомая фаза — не падение, а отчёт в js_error и меню
  expect(errors).toEqual([]);
});

test('снимок презентера: подписи подсчёта креста со Знамениями', async ({ page }) => {
  const errors = await boot(page);
  const log = await page.evaluate(async () => {
    const w = window as unknown as W;
    const app = w.starweave;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    app.runs.startRun('classic', false, 0, 4242);
    await sleep(300);
    const { createOmen } = await import('/src/core/omen-instance.ts');
    const run = app.run!;
    run.omens = ['stardust', 'pillar', 'horizon'].map((id) => createOmen(run, id));
    app.runs.beginNight();
    await sleep(200);
    // Крест: ряд 0 и столбец 3 закрывает 7 Звёзд в клетке 3
    const night = run.night!;
    const card = (id: number, rank: number, suit: 'sun' | 'moon' | 'star' | 'comet', glyph?: 'radiant' | 'echo') => ({ id, rank, suit, ...(glyph ? { glyph } : {}) });
    night.grid = Array(16).fill(null);
    night.grid[0] = card(901, 7, 'sun', 'radiant');
    night.grid[1] = card(902, 7, 'moon');
    night.grid[2] = card(903, 2, 'comet');
    night.grid[7] = card(904, 5, 'star', 'echo');
    night.grid[11] = card(905, 6, 'star');
    night.grid[15] = card(906, 8, 'star');
    night.hand = [card(907, 7, 'star'), ...night.hand.slice(1)];
    night.target = 1e9;
    app.settings.speed = 2;
    app.svc.world.res.speed = 8;
    await app.router.route();
    await sleep(1500);
    const scene = w.__scene!;
    const hud = scene.hud as unknown as Record<string, (...a: unknown[]) => unknown>;
    const seen: string[] = [];
    for (const name of ['showRibbon', 'setCaption', 'setCalcLabel', 'setCalcTotal']) {
      const orig = hud[name]!.bind(hud);
      hud[name] = (...a: unknown[]) => {
        seen.push(`${name}: ${a.filter((x) => typeof x === 'string' || typeof x === 'number').join(' | ')}`);
        return orig(...a);
      };
    }
    await scene.place(0, 3);
    return seen;
  });
  expect(errors).toEqual([]);
  expect(log.join('\n')).toMatchSnapshot('presenter-cross.txt');
});
