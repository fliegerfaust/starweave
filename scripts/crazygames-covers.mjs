// Обложки CrazyGames из ключевого арта (`store/crazygames/art/`, рисовал Денис в ChatGPT Image):
// на арт ложится название шрифтом игры (Forum), и всё снимается в нужных размерах.
//   node scripts/crazygames-covers.mjs
// Требования площадки: 1920×1080, 800×1200, 800×800, один стиль, из текста — только название.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const art = path.join(root, 'store/crazygames/art');
const out = path.join(root, 'store/crazygames');
await mkdir(out, { recursive: true });

const font = await readFile(path.join(root, 'node_modules/@fontsource/forum/files/forum-latin-400-normal.woff2'));
const dataUrl = async (file) => `data:image/webp;base64,${(await readFile(path.join(art, file))).toString('base64')}`;

/**
 * Где название: на широкой — в пустой левой трети, на вертикали и квадрате — в пустой
 * полосе под картами. `shade` — тёмная подложка под буквами, чтобы туманность не спорила с ними.
 */
const COVERS = [
  { file: 'cover-1920x1080.png', w: 1920, h: 1080, art: 'key-16x9.webp', bg: 'center / cover', size: 112, place: 'left: 5%; top: 50%; transform: translateY(-50%); text-align: left;', shade: 'linear-gradient(90deg, rgb(4 4 20 / 0.55), transparent 45%)' },
  { file: 'cover-800x1200.png', w: 800, h: 1200, art: 'key-2x3.webp', bg: 'center / cover', size: 104, place: 'left: 0; right: 0; bottom: 11%; text-align: center;', shade: 'linear-gradient(0deg, rgb(4 4 20 / 0.7), transparent 38%)' },
  { file: 'cover-800x800.png', w: 800, h: 800, art: 'key-2x3.webp', bg: 'center 22% / 100% auto', size: 88, place: 'left: 0; right: 0; bottom: 6%; text-align: center;', shade: 'linear-gradient(0deg, rgb(4 4 20 / 0.75), transparent 34%)' },
];

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const c of COVERS) {
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>
      @font-face { font-family: Forum; src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2'); }
      html, body { margin: 0; width: ${c.w}px; height: ${c.h}px; overflow: hidden; background: #05051a; }
      .art { position: absolute; inset: 0; background: url(${await dataUrl(c.art)}) no-repeat ${c.bg}; }
      .shade { position: absolute; inset: 0; background: ${c.shade}; }
      h1 { position: absolute; ${c.place} margin: 0; font: 400 ${c.size}px/1 Forum, serif; letter-spacing: 0.1em;
        text-transform: uppercase; color: #ffe6a8;
        background: linear-gradient(180deg, #fff6d8 10%, #ffd98a 55%, #d9a441 95%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 2px 0 rgb(110 60 10 / 0.7)) drop-shadow(0 0 ${Math.round(c.size / 4)}px rgb(255 200 110 / 0.45)); }
    </style><div class="art"></div><div class="shade"></div><h1>Starweave</h1>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, c.file) });
    await page.close();
    console.log(`store/crazygames/${c.file}`);
  }
} finally {
  await browser.close();
}
