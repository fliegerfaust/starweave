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

/**
 * «Карта неба» (RT.2): глава с развилками на каждом устройстве и обоих языках, в начале главы
 * и на втором шаге, с зоной Telegram на телефонах. Звёзды и видимые подписи не налезают друг
 * на друга, ничего не вылезает (fit-audit), кнопка на экране, а при выборе каждого пути ни
 * плашка, ни кнопка, ни карта не меняют размер и место (правило Дениса).
 */
test('карта неба: развилки без наложений, выбор ничего не сдвигает', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  await page.evaluate(() => {
    const app = (window as unknown as { starweave: { profile: Record<string, unknown>; runs: { startRun(s: string): void } } }).starweave;
    Object.assign(app.profile, { tutorialDone: true, bestAnte: 3, runs: 4 });
    app.runs.startRun('classic');
  });
  await page.waitForSelector('.map');
  const failures: string[] = [];
  for (const lang of ['ru', 'en'])
  for (const tg of isMobile ? [false, true] : [false])
  for (const ante of [1, 4, 8])
  for (const step of [0, 1]) {
    const res = await page.evaluate(async ({ lang, tg, ante, step }) => {
      const { setLang } = await import('/src/i18n/index.ts');
      const { planChapter, routeOptions } = await import('/src/core/route.ts');
      setLang(lang as 'ru' | 'en');
      type Run = { ante: number; phase: string; chapter: { at: number; path: number[]; nodes: unknown[] }; unlocks: { routes: boolean } };
      const app = (window as unknown as { starweave: { run: Run; router: { route(): Promise<void> } } }).starweave;
      const run = app.run;
      Object.assign(run, { ante, phase: 'map' });
      run.unlocks.routes = true;
      run.chapter = planChapter(run as never) as never;
      if (step) {
        run.chapter.path = [routeOptions(run.chapter as never)[0]!];
        run.chapter.at = -1;
      }
      const top = innerWidth > innerHeight ? 50 : innerHeight < 700 ? 66 : 105;
      document.documentElement.style.setProperty('--safe-top', tg ? `${top}px` : '');
      await app.router.route();
      await new Promise((r) => setTimeout(r, 150));
      const out: string[] = [];
      const map = document.querySelector<HTMLElement>('.map.sm');
      if (!map) return { out: ['нет карты неба'], boxes: [] };
      const rects: [string, DOMRect][] = [];
      for (const st of map.querySelectorAll<HTMLElement>('.sm-star:not(.gone)')) {
        rects.push([`звезда ${st.dataset.i ?? 'ты'}`, st.getBoundingClientRect()]);
        const lbl = st.querySelector<HTMLElement>('.sm-lbl');
        if (lbl && getComputedStyle(lbl).opacity !== '0') rects.push([`подпись ${lbl.textContent}`, lbl.getBoundingClientRect()]);
      }
      rects.forEach(([a, x], i) => rects.forEach(([b, y], j) => {
        if (j <= i) return;
        if (x.left < y.right - 1 && x.right > y.left + 1 && x.top < y.bottom - 1 && x.bottom > y.top + 1) out.push(`${a} налезает на ${b}`);
      }));
      const go = document.querySelector('.sm-go')!.getBoundingClientRect();
      if (go.bottom > innerHeight + 1 || go.right > innerWidth + 1) out.push('кнопка за экраном');
      const box = () => ['.sm-detail', '.sm-go', '.sm-map'].map((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return `${Math.round(r.top)},${Math.round(r.height)},${Math.round(r.width)}`; }).join(' ');
      const boxes = [box()];
      for (const st of map.querySelectorAll<HTMLElement>('.sm-star.open')) {
        st.click();
        await new Promise((r) => setTimeout(r, 260));
        boxes.push(box());
      }
      return { out, boxes };
    }, { lang, tg, ante, step });
    const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas'));
    const tag = `${lang} гл.${ante} шаг ${step + 1}${tg ? ' Telegram' : ''}`;
    if (res.out.length) failures.push(`${tag}: ${res.out.slice(0, 3).join('; ')}`);
    if (new Set(res.boxes).size > 1) failures.push(`${tag}: выбор сдвигает экран ${[...new Set(res.boxes)].join(' | ')}`);
    if (audit.length) failures.push(`${tag}: ${audit.slice(0, 2).join('; ')}`);
    if (lang === 'ru' && !tg && ante === 4) await page.screenshot({ path: `e2e-results/${test.info().project.name}/sky-map-${step + 1}.png` });
  }
  expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Комета и Телескоп (RT.4, RT.7): на каждом устройстве и обоих языках — три строки одной
 * высоты, всё на экране и ничего не вылезает (fit-audit), выбор строки ничего не сдвигает
 * (правило Дениса), подсказка ключевого слова и следующая в цепочке — целиком в экране,
 * «Обменять»/«Взять» проходит шаг: снова карта главы, путь записан.
 */
test('Комета и Телескоп: строки одной высоты, подсказки в экране, шаг пройден', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { starweave?: unknown }).starweave && !!document.querySelector('.menu-buttons .btn'));
  const failures: string[] = [];
  for (const lang of ['ru', 'en'])
  for (const kind of ['comet', 'telescope']) {
    const res = await page.evaluate(async ({ lang, kind }) => {
      const { setLang } = await import('/src/i18n/index.ts');
      const { planChapter } = await import('/src/core/route.ts');
      setLang(lang as 'ru' | 'en');
      type Node = { route: string; step: number };
      type App = { profile: Record<string, unknown>; run: { gold: number; phase: string; chapter: { nodes: Node[]; path: number[] } }; runs: { startRun(s: string, d: boolean, st: number, seed: number): void; visitWonder(i: number): void } };
      const app = (window as unknown as { starweave: App }).starweave;
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, bestAnte: 6, eclipses: 9, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
      let seed = 4242;
      for (; seed < 4600; seed++) if ((planChapter({ ante: 1, bosses: ['void'], seed, unlocks: { routes: true, wonders: true } } as never) as { nodes: Node[] }).nodes.some((n) => n.step === 1 && n.route === kind)) break;
      app.runs.startRun('classic', false, 0, seed);
      await new Promise((r) => setTimeout(r, 300));
      app.run.gold = 20;
      app.runs.visitWonder(app.run.chapter.nodes.findIndex((n) => n.route === kind && n.step === 1));
      await new Promise((r) => setTimeout(r, 500));
      const out: string[] = [];
      const rows = [...document.querySelectorAll<HTMLElement>('.wd-row')];
      if (rows.length !== 3) out.push(`строк ${rows.length}`);
      if (new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height))).size > 1) out.push('строки разной высоты');
      const inView = (r: DOMRect) => r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      for (const el of [...rows, ...document.querySelectorAll<HTMLElement>('.scene-acts .btn')]) if (!inView(el.getBoundingClientRect())) out.push(`за экраном: ${el.className}`);
      const box = () => ['.wd-rows', '.wd-take', '.scene-ribbon'].map((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return `${Math.round(r.top)},${Math.round(r.height)},${Math.round(r.width)}`; }).join(' ');
      const boxes = [box()];
      for (const r of rows) {
        r.click();
        await new Promise((res) => setTimeout(res, 120));
        boxes.push(box());
      }
      if (new Set(boxes).size > 1) out.push(`выбор сдвигает экран ${[...new Set(boxes)].join(' | ')}`);
      // Подсказка ключевого слова и следующая в цепочке — целиком в экране
      const kw = document.querySelector<HTMLElement>('.wd-row .kw');
      if (!kw) out.push('нет ключевых слов');
      else {
        kw.click();
        await new Promise((res) => setTimeout(res, 120));
        const tip = () => document.querySelector<HTMLElement>('.kw-hint');
        if (!tip() || !inView(tip()!.getBoundingClientRect())) out.push('подсказка не в экране');
        const inner = tip()?.querySelector<HTMLElement>('.kw');
        if (inner) {
          inner.click();
          await new Promise((res) => setTimeout(res, 120));
          if (!tip()?.querySelector('.kw-back')) out.push('в цепочке нет «назад»');
          if (!tip() || !inView(tip()!.getBoundingClientRect())) out.push('подсказка в цепочке не в экране');
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        if (tip()) out.push('Escape не закрыл подсказку');
      }
      return out;
    }, { lang, kind });
    const audit = ((await page.evaluate(FIT_AUDIT)) as string[]).filter((p) => !p.includes('canvas'));
    const tag = `${lang} ${kind}`;
    if (res.length) failures.push(`${tag}: ${res.slice(0, 3).join('; ')}`);
    if (audit.length) failures.push(`${tag}: ${audit.slice(0, 2).join('; ')}`);
    if (lang === 'ru') await page.screenshot({ path: `e2e-results/${test.info().project.name}/${kind}.png` });
    await page.locator('.wd-take').click();
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => { const r = (window as unknown as { starweave: { run: { phase: string; chapter: { path: number[] } } } }).starweave.run; return `${r.phase} ${r.chapter.path.length}`; });
    if (after !== 'map 1') failures.push(`${tag}: после выбора ${after}`);
  }
  expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
  expect(errors).toEqual([]);
});
