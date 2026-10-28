// Вертикальные ролики 1080×1920, 60 fps, без пропущенных кадров: `npm run clips`.
//   npm run clips                      — все ролики, ru и en
//   npm run clips -- cross surge       — выбранные
//   npm run clips -- --lang ru         — один язык
//   npm run clips -- --raw             — только запись игры, без оформления
//   npm run clips -- --reuse           — только оформление, запись игры — прошлая
//   npm run clips -- --raw --view 960x540 --scale 2 — запись в другом кадре (16:9 и 360x540 ×3 для 2:3)
//   npm run clips -- --raw --ff wideDesktop,brightFlare — с переключателями площадки (?ff=, см. src/platform/features.ts)
// 1. Игра идёт в Chrome без окна на виртуальном времени (scripts/clips/virtual-time.js):
//    шаг 1/60 с → снимок → ffmpeg. Звук — тем же кодом в OfflineAudioContext.
//    Запись → clips/public/raw/<ролик>-<язык>.mp4.
// 2. Remotion (проект clips/) кладёт игру в рамку и добавляет анимированный крючок.
//    Результат — store/clips/<ролик>-<язык>.mp4. Тексты крючков — clips/src/Root.tsx.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

/** Ролик → сценарий игры (src/dev/demo.ts). Ответ к загадке — тот же крест. */
const CLIPS = { cross: 'cross', answer: 'cross', puzzle: 'puzzle', cascade: 'cascade', surge: 'surge' };
const FPS = 60;
/** 360×640 CSS-пикселей × 3 = 1080×1920. */
let VIEW = { width: 360, height: 640 };
let SCALE = 3;
/** Предохранитель: сценарий обязан закончиться за это виртуальное время. */
const MAX_SECONDS = 60;

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'store/clips');
const remotionDir = path.join(root, 'clips');
const rawDir = path.join(remotionDir, 'public/raw');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const names = [];
  let langs = ['ru', 'en'];
  let raw = false;
  let reuse = false;
  let view = null;
  let scale = null;
  let ff = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') langs = [argv[++i]];
    else if (argv[i] === '--raw') raw = true;
    else if (argv[i] === '--reuse') reuse = true;
    else if (argv[i] === '--view') view = argv[++i];
    else if (argv[i] === '--scale') scale = Number(argv[++i]);
    else if (argv[i] === '--ff') ff = argv[++i];
    else names.push(argv[i]);
  }
  const all = Object.keys(CLIPS);
  const unknown = names.filter((n) => !all.includes(n));
  if (unknown.length) throw new Error(`нет ролика: ${unknown.join(', ')} (есть: ${all.join(', ')})`);
  if (view && !raw) throw new Error('--view — только с --raw: оформление Remotion рассчитано на 1080×1920');
  return { names: names.length ? names : all, langs, raw, reuse, view, scale, ff };
}

function run(cmd, args, { input, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd}: код ${code}`))));
    if (input) input(proc.stdin);
  });
}

const ffmpeg = (args, input) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input });

async function record(browser, base, name, lang, tmp) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, isMobile: VIEW.height > VIEW.width, hasTouch: VIEW.height > VIEW.width, locale: lang });
  await context.addInitScript({ path: path.join(import.meta.dirname, 'clips/virtual-time.js') });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [${name}] ошибка страницы:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(`  [${name}]`, m.text()));
  const cdp = await context.newCDPSession(page);
  await page.goto(`${base}?demo=${name}&capture&lang=${lang}${FF ? `&ff=${FF}` : ''}`);

  const video = path.join(tmp, `${name}-${lang}.video.mp4`);
  let frames = 0;
  let write;
  const encoding = ffmpeg(
    ['-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', video],
    (stdin) => {
      write = (buf) => new Promise((r) => (stdin.write(buf) ? r() : stdin.once('drain', r)));
      write.end = () => stdin.end();
    },
  );

  const step = () =>
    page.evaluate(async (ms) => {
      await window.__vt.step(ms);
      const c = window.__clip;
      return { recording: c?.t0 != null && !c.done, done: !!c?.done };
    }, 1000 / FPS);

  for (let i = 0; i < MAX_SECONDS * FPS; i++) {
    const state = await step();
    if (state.done) break;
    if (!state.recording) continue;
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, ...VIEW, scale: SCALE } });
    await write(Buffer.from(shot.data, 'base64'));
    frames++;
  }
  write.end();
  await encoding;
  if (!frames) throw new Error(`${name}: сценарий не начал запись`);

  const wav = path.join(tmp, `${name}-${lang}.wav`);
  await writeFile(wav, Buffer.from(await page.evaluate(() => window.__clip.renderAudio()), 'base64'));
  await context.close();
  return { video, wav, seconds: frames / FPS };
}

/** Запись игры: видео + звук, без оформления. */
async function mux({ video, wav, seconds }, out) {
  await ffmpeg(['-i', video, '-i', wav, '-t', seconds.toFixed(3), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', out]);
}

/** Кадров в готовой записи игры. */
function countFrames(file) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(`нет записи ${path.relative(root, file)} — сначала без --reuse`))));
  });
}

/** Оформление в Remotion: рамка, крючок, повтор без шва. */
async function render(name, lang, frames, out) {
  const props = path.join(tmp, `${name}-${lang}.props.json`);
  await writeFile(props, JSON.stringify({ scenario: name, lang, frames }));
  await run(
    path.join(remotionDir, 'node_modules/.bin/remotion'),
    ['render', 'src/index.ts', name, out, `--props=${props}`, '--codec=h264', '--crf=18', `--browser-executable=${CHROME}`, '--log=warn'],
    { cwd: remotionDir },
  );
}

const { names, langs, raw, reuse, view, scale, ff: FF } = parseArgs(process.argv.slice(2));
if (view) {
  const [width, height] = view.split('x').map(Number);
  VIEW = { width, height };
}
if (scale) SCALE = scale;
/** Запись в другом кадре кладётся рядом с подписью кадра: `cross-en-640x360.mp4`. */
const suffix = view ? `-${view}` : '';
await mkdir(outDir, { recursive: true });
await mkdir(rawDir, { recursive: true });
const tmp = path.join(tmpdir(), `starweave-clips-${process.pid}`);
await mkdir(tmp, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  /** Одна запись игры на сценарий и язык: «Ответ» берёт запись креста. */
  const recorded = new Map();
  for (const name of names) {
    for (const lang of langs) {
      const started = Date.now();
      const key = `${CLIPS[name]}-${lang}`;
      const rawOut = path.join(rawDir, `${name}-${lang}${suffix}.mp4`);
      let frames;
      if (reuse) frames = await countFrames(rawOut);
      else {
        if (!recorded.has(key)) recorded.set(key, await record(browser, base, CLIPS[name], lang, tmp));
        const parts = recorded.get(key);
        await mux(parts, rawOut);
        frames = Math.round(parts.seconds * FPS);
      }
      const out = raw ? rawOut : path.join(outDir, `${name}-${lang}.mp4`);
      if (!raw) await render(name, lang, frames, out);
      const size = (await readFile(out)).length / 1e6;
      console.log(`${path.relative(root, out)} — ${(frames / FPS).toFixed(1)} с, ${size.toFixed(1)} МБ, ${((Date.now() - started) / 1000).toFixed(0)} с`);
    }
  }
} finally {
  await browser.close();
  await server.close();
  await rm(tmp, { recursive: true, force: true });
}
