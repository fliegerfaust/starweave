import { expect, test, type Page } from '@playwright/test';

/**
 * Возврат из фона (BG.1, отзыв Андрея 28.10): Chrome на Android выбрасывает буферы холстов, пока
 * игра свёрнута, — пропадали медальоны Знамений, карта в руке, значки Затмений. Здесь буферы
 * выбрасываются нарочно (`simulateCanvasLoss`), как это делает браузер, с событиями и молча, и
 * после возврата из фона все холсты на экране и в кэше спрайтов должны быть нарисованы снова.
 */
type App = { profile: Record<string, unknown>; run: Record<string, unknown>; runs: { startRun(s: string, daily?: boolean, stake?: number, seed?: number): void; beginNight(node?: number): void; collectReward(): void }; router: { route(): Promise<void> } };

/** Холсты интерфейса, на которых нет ни одного видимого пикселя (проверка сеткой 9×9). */
async function blankCanvases(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLCanvasElement>('#ui canvas, body > .modal-backdrop canvas').forEach((c, i) => {
      if (!c.width || !c.height || !c.isConnected) return;
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let seen = false;
      for (let y = 0; y < 9 && !seen; y++) {
        for (let x = 0; x < 9 && !seen; x++) {
          for (let dy = 0; dy < c.height / 9 && !seen; dy += 2) {
            const py = Math.floor((y * c.height) / 9 + dy);
            for (let dx = 0; dx < c.width / 9; dx += 2) {
              const px = Math.floor((x * c.width) / 9 + dx);
              if (data[(py * c.width + px) * 4 + 3]! > 8) {
                seen = true;
                break;
              }
            }
          }
        }
      }
      if (!seen) out.push(`${c.className || c.parentElement?.className || 'canvas'}#${i}`);
    });
    return out;
  });
}

async function loseAndReturn(page: Page, silent: boolean): Promise<number> {
  const n = await page.evaluate((silent) => (window as unknown as { simulateCanvasLoss(s: boolean): number }).simulateCanvasLoss(silent), silent);
  // Возврат из фона: событие фокуса окна (видимость в автотесте всегда «visible»)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);
  return n;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
}

for (const silent of [false, true]) {
  const how = silent ? 'браузер промолчал' : 'с событиями contextlost';
  test(`Обсерватория: Знамения и товары после сворачивания (${how})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    await page.evaluate(async () => {
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      const { createOmen } = await import('/src/core/omen-instance.ts');
      const app = (window as unknown as { starweave: App }).starweave;
      app.profile.tutorialDone = true;
      app.profile.runs = 12;
      app.runs.startRun('classic', false, 0, 4242);
      await new Promise((r) => setTimeout(r, 300));
      const run = app.run as never as { ante: number; gold: number; omens: unknown[]; phase: string; reward: unknown; night: unknown; pending: unknown[] };
      run.ante = 3;
      run.gold = 23;
      run.omens = ['horizon', 'corona', 'stardust', 'pyre', 'abacus'].map((id) => createOmen(run as never, id));
      run.phase = 'reward';
      run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
      run.night = null;
      app.runs.collectReward();
      await new Promise((r) => setTimeout(r, 300));
      run.pending = [];
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      await app.router.route();
    });
    await page.waitForTimeout(700);
    const shown = await page.locator('#ui canvas').count();
    expect(shown).toBeGreaterThan(5);
    expect(await blankCanvases(page)).toEqual([]);
    const lost = await loseAndReturn(page, silent);
    expect(lost).toBeGreaterThan(shown);
    expect(await blankCanvases(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Ночь: HUD, рука и спрайты кэша после сворачивания (${how})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    await page.evaluate(async () => {
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      const { createOmen } = await import('/src/core/omen-instance.ts');
      const app = (window as unknown as { starweave: App }).starweave;
      app.profile.tutorialDone = true;
      app.profile.runs = 12;
      app.runs.startRun('classic', false, 0, 4242);
      await new Promise((r) => setTimeout(r, 300));
      const run = app.run as never as { omens: unknown[] };
      run.omens = ['horizon', 'pyre'].map((id) => createOmen(run as never, id));
      // Опытный игрок: сначала карта главы, ночь — по первому узлу пути
      app.runs.beginNight(0);
    });
    await page.waitForFunction(() => (window as unknown as { starweave: App }).starweave.run.phase === 'night');
    await page.waitForSelector('.hud .omen-slot canvas, .hud canvas');
    await page.waitForTimeout(900);
    // Спрайт из того же кэша, из которого рисуется рука на основном холсте
    await page.evaluate(async () => {
      const { cardFace } = await import('/src/art/card.ts');
      (window as unknown as { probe: HTMLCanvasElement }).probe = cardFace({ suit: 'comet', rank: 8 }, 80, 2);
    });
    const probeBlank = () => page.evaluate(() => {
      const c = (window as unknown as { probe: HTMLCanvasElement }).probe;
      const d = c.getContext('2d')!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
      return d[3] === 0;
    });
    expect(await probeBlank()).toBe(false);
    expect(await blankCanvases(page)).toEqual([]);
    await loseAndReturn(page, silent);
    expect(await probeBlank()).toBe(false);
    expect(await blankCanvases(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
