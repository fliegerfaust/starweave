// Карты исходников прошлых сборок — на сайт вместе с новой сборкой.
// GitHub Pages при каждом деплое заменяет сайт целиком, а ошибки от игроков со старой
// версией в кэше приходят ещё долго. Сводка расшифровывает их стеки по `<файл>.js.map`
// рядом со сборкой — значит, карты прошлых сборок должны остаться на сайте.
// Сайт публикует список своих карт (sourcemaps.txt); новый деплой докачивает по нему
// недостающие карты с живого сайта. Сеть недоступна — деплой всё равно идёт, без старых карт.
//
//   node scripts/keep-sourcemaps.mjs dist https://fliegerfaust.github.io/starweave
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir = 'dist', siteArg] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY ?? '';
const site = (siteArg ?? process.env.SITE_URL ?? (repo ? `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}` : '')).replace(/\/$/, '');
/** Сколько карт держать: ~6 на сборку, этого хватает на десятки прошлых версий. */
const KEEP = 400;
const PATH = /^assets\/[A-Za-z0-9_.-]+\.js\.map$/;

const own = readdirSync(join(dir, 'assets'))
  .filter((f) => f.endsWith('.js.map'))
  .map((f) => `assets/${f}`);

async function text(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Список карт живого сайта; у сайта без списка (первый деплой) — карты его текущей сборки. */
async function liveList() {
  const list = await text(`${site}/sourcemaps.txt`);
  if (list !== null) return list.split('\n').map((s) => s.trim()).filter((s) => PATH.test(s));
  // Имена чанков записаны внутри других чанков — обходим от входного файла вглубь
  const index = await text(`${site}/index.html`);
  const entry = index?.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!entry) return [];
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length && seen.size < 80) {
    const code = await text(`${site}/${queue.shift()}`);
    for (const m of code?.matchAll(/[A-Za-z0-9_]+-[A-Za-z0-9_-]{8}\.js/g) ?? []) {
      const js = `assets/${m[0]}`;
      if (!seen.has(js)) {
        seen.add(js);
        queue.push(js);
      }
    }
  }
  return [...seen].map((js) => `${js}.map`).filter((s) => PATH.test(s));
}

const kept = [];
if (site) {
  const old = (await liveList()).filter((p) => !own.includes(p));
  for (const path of old) {
    if (own.length + kept.length >= KEEP) break;
    const target = join(dir, path);
    if (existsSync(target)) continue;
    const map = await text(`${site}/${path}`);
    // Только похожее на карту исходников: чужое на сайт не кладём
    if (!map || !map.trimStart().startsWith('{') || !map.includes('"mappings"')) continue;
    writeFileSync(target, map);
    kept.push(path);
  }
}
writeFileSync(join(dir, 'sourcemaps.txt'), [...own, ...kept].join('\n') + '\n');
console.log(`${dir}: карт этой сборки ${own.length}, сохранено прошлых ${kept.length}${site ? ` (с ${site})` : ' (адрес сайта не задан)'}`);
