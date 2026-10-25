// Иконки карточки Пикабу Игр из ключевого арта (`store/pikabu/art/`, рисуется в GPT Image,
// промпты — store/pikabu/art-prompts.md): квадратная без текста, на горизонтальную ложится
// название шрифтом игры (Forum).
//   node scripts/pikabu-covers.mjs [папка арта]
// Требования площадки: квадратная от 1024×1024, горизонтальная от 1920×1080 (16:9), jpg/png/webp до 10 МБ.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const art = path.resolve(process.argv[2] ?? path.join(root, 'store/pikabu/art'));
const out = path.join(root, 'store/pikabu');
await mkdir(out, { recursive: true });

const font = (await readFile(path.join(root, 'node_modules/@fontsource/forum/files/forum-cyrillic-400-normal.woff2'))).toString('base64');
const dataUrl = async (base) => {
  for (const ext of ['png', 'webp', 'jpg']) {
    try {
      return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${(await readFile(path.join(art, `${base}.${ext}`))).toString('base64')}`;
    } catch {}
  }
  throw new Error(`нет ${base}.png|webp|jpg в ${art}`);
};

/** Название — в пустой левой части широкой картинки, с тёмной подложкой против туманности. */
const COVERS = [
  { file: 'icon-1024x1024.png', w: 1024, h: 1024, art: 'key-1x1', title: false },
  { file: 'icon-1920x1080.png', w: 1920, h: 1080, art: 'key-16x9', title: true },
];

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const c of COVERS) {
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>
      @font-face { font-family: Forum; src: url(data:font/woff2;base64,${font}) format('woff2'); }
      html, body { margin: 0; width: ${c.w}px; height: ${c.h}px; overflow: hidden; background: #05051a; }
      .art { position: absolute; inset: 0; background: url(${await dataUrl(c.art)}) no-repeat center / cover; }
      .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(4 4 20 / 0.6), rgb(4 4 20 / 0.25) 38%, transparent 55%); }
      h1 { position: absolute; left: 6%; top: 50%; transform: translateY(-50%); margin: 0; text-align: left;
        font: 400 128px/0.98 Forum, serif; letter-spacing: 0.06em; text-transform: uppercase;
        background: linear-gradient(180deg, #fff6d8 10%, #ffd98a 55%, #d9a441 95%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 3px 0 rgb(110 60 10 / 0.7)) drop-shadow(0 0 32px rgb(255 200 110 / 0.45)); }
    </style><div class="art"></div>${c.title ? '<div class="shade"></div><h1>Звёздное<br>плетение</h1>' : ''}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, c.file) });
    await page.close();
    console.log(c.file);
  }
} finally {
  await browser.close();
}
