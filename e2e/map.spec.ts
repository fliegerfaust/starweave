import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Проверка «ничего не вылезает из плашки» (e2e/fit-audit.js), пустой список — всё на месте. */
const FIT_AUDIT = readFileSync(new URL('./fit-audit.js', import.meta.url), 'utf8');

/**
 * Карта главы «Восхождение» (RD.2): у каждой главы своя расстановка ночей по сиду забега.
 * На каждом устройстве перебираем главы, положение в главе и забеги: генератор должен
 * найти расстановку без запасного варианта, звёзды и подписи разных ночей не пересекаются,
 * и fit-audit не находит вылезающего текста. На телефонах — ещё и с зоной Telegram сверху.
 * Оба языка: в английском длиннее имена, в русском — правила Затмения.
 */
test('карта главы: своя расстановка в каждой главе без наложений', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: { tutorialDone: boolean }; runs: { startRun(s: string): void } } }).starweave;
    app.profile.tutorialDone = true;
    app.runs.startRun('classic');
  });
  await page.waitForSelector('.map');

  const OMENS = ['horizon', 'pyre', 'stardust', 'abacus', 'corona'];
  // Все Затмения по кругу: с забегом сдвигается, какое из них приходится на главу
  const BOSSES = ['void', 'eclipse-sun', 'eclipse-moon', 'eclipse-star', 'eclipse-comet', 'fog', 'drought', 'shortNight', 'silence', 'gravity', 'judge', 'wane', 'hunger'];
  const failures: string[] = [];
  const layouts = new Set<string>();
  for (const lang of ['ru', 'en'])
  for (const tg of isMobile ? [false, true] : [false]) {
    for (let ante = 1; ante <= 8; ante++) {
      for (const night of [0, 1, 2]) {
        for (const seed of [11, 202, 3003, 40]) {
          const res = await page.evaluate(
            async ({ ante, night, seed, tg, omens, lang, bosses }) => {
              const { createOmen } = await import('/src/core/omen-instance.ts');
              const { setLang } = await import('/src/i18n/index.ts');
              const { planChapter } = await import('/src/core/route.ts');
              setLang(lang as 'ru' | 'en');
              type Run = { ante: number; chapter: { nodes: unknown[]; at: number }; seed: number; omens: unknown[]; phase: string; bosses: string[] };
              const app = (window as unknown as { starweave: { run: Run; router: { route(): Promise<void> } } }).starweave;
              const run = app.run;
              Object.assign(run, { ante, seed, phase: 'map' });
              run.bosses = Array.from({ length: 8 }, (_, i) => bosses[(i + seed) % bosses.length]!);
              run.chapter = { ...planChapter(run), at: night };
              run.omens = omens.slice(0, Math.min(5, ante - 1)).map((id) => createOmen(run as never, id));
              // Зона Telegram во весь экран: строка состояния + кнопки Telegram. В ландшафте
              // строки состояния нет, на iPhone SE она низкая.
              const top = innerWidth > innerHeight ? 50 : innerHeight < 700 ? 66 : 105;
              document.documentElement.style.setProperty('--safe-top', tg ? `${top}px` : '');
              await app.router.route();
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
              const map = document.querySelector<HTMLElement>('.map')!;
              const rect = (el: Element) => el.getBoundingClientRect();
              const nodes = [...map.querySelectorAll('.map-node')].map((n) => [rect(n.querySelector('.map-star')!), rect(n.querySelector('.map-tag')!)]);
              let overlap = '';
              nodes.forEach((a, i) => nodes.forEach((b, j) => {
                if (j <= i) return;
                for (const x of a) for (const y of b) if (x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top) overlap = `ночи ${i} и ${j}`;
              }));
              const where = nodes.map(([s]) => `${Math.round(s.left / 20)}:${Math.round(s.top / 20)}`).join(' ');
              return { fit: map.dataset.fit, overlap, where };
            },
            { ante, night, seed, tg, omens: OMENS, lang, bosses: BOSSES },
          );
          const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas'));
          layouts.add(res.where);
          const tag = `${lang} гл.${ante} ночь ${night} сид ${seed}${tg ? ' Telegram' : ''}`;
          if (res.fit !== 'ok') failures.push(`${tag}: запасная расстановка`);
          if (res.overlap) failures.push(`${tag}: наложение, ${res.overlap}`);
          if (audit.length) failures.push(`${tag}: ${audit.slice(0, 2).join('; ')}`);
        }
      }
    }
  }
  await page.screenshot({ path: `e2e-results/${test.info().project.name}/map.png` });
  expect(failures, failures.slice(0, 8).join('\n')).toEqual([]);
  // Разнообразие: расстановки глав не совпадают между собой
  expect(layouts.size, 'расстановки разные').toBeGreaterThan(80);
  expect(errors).toEqual([]);
});
