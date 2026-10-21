import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Окна ночи «Сцена» (RD.3): награда, поражение, вызов дня, победа — сценами по небу; пауза
 * и колода — листами; «Новое созвездие» — лентой. На каждом устройстве открываем все окна
 * и проверяем: кнопки целиком на экране, fit-audit чист, ошибок нет. Оба языка.
 */
type App = {
  profile: { tutorialDone: boolean };
  run: Record<string, unknown> & { night: Record<string, unknown> | null; stats: Record<string, unknown> };
  startRun(s: string): void;
  beginNight(): void;
  route(): Promise<void>;
};

async function open(page: Page, lang: 'ru' | 'en', state: string): Promise<void> {
  await page.evaluate(async ({ lang, state }) => {
    const { setLang } = await import('/src/i18n/index.ts');
    setLang(lang);
    document.querySelectorAll('.modal-backdrop, .discovery').forEach((el) => el.remove());
    const app = (window as unknown as { starweave: App }).starweave;
    app.profile.tutorialDone = true;
    app.startRun('classic');
    await new Promise((r) => setTimeout(r, 300));
    app.beginNight();
    await new Promise((r) => setTimeout(r, 900));
    const run = app.run;
    Object.assign(run.stats, { nightsWon: 7, linesIgnited: 64, crosses: 5, bestPlacement: 18400, bestCombo: 'supernova', goldEarned: 212 });
    const night = run.night!;
    if (state === 'reward') {
      Object.assign(night, { score: 3412, target: 2800 });
      run.phase = 'reward';
      run.reward = { base: 4, moves: 2, burns: 1, interest: 2, total: 9 };
    } else if (state === 'lost' || state === 'daily') {
      Object.assign(night, { score: 2310, target: 2800, movesLeft: 0 });
      run.phase = 'gameOver';
      run.daily = state === 'daily';
    } else if (state === 'win') {
      run.phase = 'victory';
    }
    if (['reward', 'lost', 'daily', 'win'].includes(state)) await app.route();
    if (state === 'pause') document.querySelector<HTMLElement>('.hud .icon-btn.medal')!.click();
    if (state === 'deck') document.querySelector<HTMLElement>('.actions .btn, .actions button')!.click();
    if (state === 'discovery') {
      const { announceDiscovery } = await import('/src/ui/discovery.ts');
      announceDiscovery([{ kind: 'combo', id: 'cascade', count: 5 }]);
    }
  }, { lang, state });
  await page.waitForTimeout(900);
  // Тосты начала ночи к окнам не относятся — убираем со снимка
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((el) => el.remove()));
}

test('окна ночи: всё на экране, кнопки видны, ничего не вылезает', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const failures: string[] = [];
  for (const lang of ['ru', 'en'] as const) {
    for (const state of ['reward', 'lost', 'daily', 'win', 'pause', 'deck', 'discovery']) {
      await open(page, lang, state);
      const res = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const out = [...document.querySelectorAll<HTMLElement>('.scene-acts .btn, .scene-acts .scene-light, .pause-acts .btn, .deck-back .btn')]
          .filter((b) => { const r = b.getBoundingClientRect(); return r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1; })
          .map((b) => b.innerText.trim().split('\n')[0]);
        const shown = !!document.querySelector('.modal-panel.scene, .modal-panel.sheet, .discovery');
        // «Строки» (RD.12): в середине итогов нет плашек — ни заливок, ни рамок вокруг блоков
        const plates = [...document.querySelectorAll<HTMLElement>('.scene-mid *')]
          .filter((el) => !el.closest('svg') && !el.matches('.coin, .scene-bar, .scene-bar i, .scene-gold .coin'))
          .filter((el) => { const bg = getComputedStyle(el).backgroundColor; const a = /rgba?\(([^)]+)\)/.exec(bg)?.[1]?.split(',')[3]; return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && (a === undefined || Number(a) > 0.02); })
          .map((el) => el.className);
        const wide = document.body.classList.contains('landscape') && innerHeight > 560
          ? [...document.querySelectorAll<HTMLElement>('.scene-acts > .btn')].filter((b) => b.getBoundingClientRect().width > 360).length : 0;
        return { out, shown, plates, wide };
      });
      const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas') && !p.includes('.hud') && !p.includes('.actions') && !p.includes('div.modal-head') && !p.includes('div.deck-back «'));
      // Шапка листа и подложка «Назад» нарочно идут от края до края (липкие при прокрутке)
      const tag = `${lang} ${state}`;
      if (!res.shown) failures.push(`${tag}: окно не открылось`);
      if (res.out.length) failures.push(`${tag}: кнопки за экраном — ${res.out.join(', ')}`);
      if (res.plates.length) failures.push(`${tag}: плашки в итогах — ${res.plates.slice(0, 3).join(', ')}`);
      if (res.wide) failures.push(`${tag}: растянута кнопка итогов`);
      if (audit.length) failures.push(`${tag}: ${audit.slice(0, 3).join('; ')}`);
      if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/win-${state}.png` });
    }
  }
  expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
  expect(errors).toEqual([]);
});
