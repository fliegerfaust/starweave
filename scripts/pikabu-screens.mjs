// Скриншоты для карточки Пикабу Игр (PK.7): настоящие экраны игры с заголовком на русском.
// Нужен запущенный dev-сервер (npm run dev). Запуск:
//   node scripts/pikabu-screens.mjs [http://localhost:5173]
// Требования площадки: от 1280×720 (16:9) или от 720×1280 (9:16), jpg/png/webp до 10 МБ, оптимально до 5.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] ?? 'http://localhost:5173';
const out = path.join(root, 'store/pikabu/screens');
await mkdir(out, { recursive: true });

const font = (await readFile(path.join(root, 'node_modules/@fontsource/forum/files/forum-cyrillic-400-normal.woff2'))).toString('base64');
const nebula = (await readFile(path.join(root, 'store/crazygames/art/key-16x9.webp'))).toString('base64');

/** Формы: размер окна игры и плотность — снимок выходит 1920×1080 или 1080×1920. */
const FORMS = {
  landscape: { viewport: { width: 1280, height: 720 }, scale: 1.5, mobile: false, w: 1920, h: 1080 },
  portrait: { viewport: { width: 432, height: 768 }, scale: 2.5, mobile: true, w: 1080, h: 1920 },
};

const app = (page, fn, arg) => page.evaluate(fn, arg);
const SETTINGS = { lang: 'ru', sfx: 0, music: 0, speed: 1, reduceMotion: false, haptics: false };

async function open(page, query = '') {
  await page.addInitScript((s) => {
    localStorage.setItem('starweave.settings.v1', JSON.stringify(s));
    localStorage.setItem('starweave.profile.v1', JSON.stringify({ version: 1, tutorialDone: true, tutorialFinished: true, runs: 9, tutorial: ['guideSeen', 'giftSeen', 'boss', 'routes'] }));
  }, SETTINGS);
  await page.goto(`${base}/?ff=all${query ? `&${query}` : ''}`);
}

/** Ночь со вспышкой креста: сценарная первая ночь обучения, как в e2e/store-assets.spec.ts. */
async function cross(page) {
  await open(page);
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  await page.waitForTimeout(800);
  await app(page, () => window.starweave.runs.startTutorial());
  await page.waitForSelector('.tut-bubble.on');
  await app(page, async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.starweave.runs.tutorial?.stop();
    document.querySelector('.tut-layer')?.remove();
    const sc = window.__scene;
    sc.setGuide(null);
    sc.setStepPause(1);
    const code = { s: 'sun', m: 'moon', t: 'star', c: 'comet' };
    const idx = (c) => window.starweave.run.night.hand.findIndex((x) => `${x.rank}${x.suit}` === `${c.slice(0, -1)}${code[c.slice(-1)]}`);
    for (const [c, cell] of [['3s', 12], ['3m', 13], ['7t', 14], ['5c', 15]]) await sc.place(idx(c), cell);
    sc.select(idx('1m'));
    await sc.burnSelected();
    for (const [c, cell] of [['2t', 0], ['5t', 1], ['8t', 2], ['9s', 7], ['9m', 11], ['4c', 15]]) await sc.place(idx(c), cell);
    await sleep(300);
    void sc.place(idx('9t'), 3);
  });
  await page.waitForSelector('.calc.show');
  await page.waitForTimeout(Number(process.env.CROSS_MS ?? 1500));
}

/** Обсерватория: золото есть, в слотах три Знамения, на прилавке новые. */
async function shop(page) {
  await open(page);
  await page.waitForFunction(() => !!document.querySelector('.menu-buttons .btn'));
  await app(page, async () => {
    const { createOmen } = await import('/src/core/omen-instance.ts');
    const a = window.starweave;
    a.runs.startRun('classic', false, 0, 4242);
    // Без Дара ночи: после награды сразу Обсерватория
    a.run.unlocks.gift = false;
    for (const id of ['stardust', 'highNoon', 'horizon']) a.run.omens.push(createOmen(a.run, id));
    a.run.gold = 24;
    a.run.phase = 'reward';
    a.run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    a.run.night = null;
    a.runs.collectReward();
  });
  await page.waitForSelector('.shop');
  await page.waitForTimeout(1200);
}

/** Карта неба: развилки, Комета и Телескоп, два Затмения на выбор. */
async function routes(page) {
  await open(page, 'skymap&fork');
  await page.waitForSelector('.sm-star.open');
  await page.waitForTimeout(3200);
}

/** Сцена трофея после победы над Затмением. */
async function trophy(page) {
  await open(page, 'trophy');
  await page.waitForSelector('.modal-panel.reward');
  await page.waitForTimeout(1000);
  await page.locator('.modal-panel.reward .scene-acts .btn').first().click();
  await page.waitForTimeout(2600);
}

/** Коллекция: Знамения и трофеи Затмений во Справочнике. */
async function collection(page) {
  await open(page, 'collection');
  await page.waitForSelector('.modal-panel');
  await page.waitForTimeout(1500);
}

const ONLY = process.env.ONLY?.split(',');
const SHOTS = [
  ['1-cross', cross, 'Собери ряд, и он вспыхнет созвездием'],
  ['2-shop', shop, 'Знамения меняют правила в твою пользу'],
  ['3-routes', routes, 'Сам выбирай путь по звёздному небу'],
  ['4-trophy', trophy, 'Победи Затмение и забери его трофей'],
  ['5-collection', collection, 'Собирай Знамения и трофеи'],
];

/** Кадр: туманность, заголовок шрифтом игры и снимок игры в тонкой латунной рамке. */
async function compose(browser, form, shot, caption, file) {
  const f = FORMS[form];
  const wide = form === 'landscape';
  const k = wide ? 0.82 : 0.84;
  const sw = Math.round(f.w * k);
  const sh = Math.round(f.h * k);
  const size = wide ? 72 : 76;
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Forum; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    html, body { margin: 0; width: ${f.w}px; height: ${f.h}px; overflow: hidden; background: #05051a; }
    .bg { position: absolute; inset: -40px; background: url(data:image/webp;base64,${nebula}) 0% 30% / auto 260%; filter: blur(6px) brightness(0.55) saturate(1.1); }
    .cap { position: absolute; left: 0; right: 0; top: 0; height: ${f.h - sh - Math.round(f.h * 0.04)}px; display: grid; place-items: center; padding: 0 60px; box-sizing: border-box; }
    h1 { margin: 0; text-align: center; font: 400 ${size}px/1.08 Forum, serif; letter-spacing: 0.02em; text-wrap: balance;
      background: linear-gradient(180deg, #fff6d8 10%, #ffd98a 55%, #d9a441 95%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 2px 0 rgb(110 60 10 / 0.7)) drop-shadow(0 0 18px rgb(255 200 110 / 0.35)); }
    img { position: absolute; left: ${(f.w - sw) / 2}px; bottom: ${Math.round(f.h * 0.04)}px; width: ${sw}px; height: ${sh}px; border-radius: 22px;
      box-shadow: 0 0 0 2px rgb(246 194 91 / 0.55), 0 0 40px rgb(246 194 91 / 0.18), 0 30px 60px -20px rgb(0 0 0 / 0.9); }
  </style><div class="bg"></div><div class="cap"><h1>${caption}</h1></div><img src="data:image/png;base64,${shot.toString('base64')}">`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  await page.close();
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [form, f] of Object.entries(FORMS)) {
    for (const [name, scene, caption] of SHOTS.filter(([n]) => !ONLY || ONLY.some((o) => n.includes(o)))) {
      const ctx = await browser.newContext({ viewport: f.viewport, deviceScaleFactor: f.scale, isMobile: f.mobile, hasTouch: f.mobile });
      const page = await ctx.newPage();
      await scene(page);
      const shot = await page.screenshot();
      await ctx.close();
      await compose(browser, form, shot, caption, path.join(out, `${form}-${name}${process.env.SUFFIX ?? ''}.jpg`));
      console.log(`${form}-${name}`);
    }
  }
} finally {
  await browser.close();
}
