// Сборка витрин релиза 0.7 «Глубина» (docs/vitrines/src → docs/vitrines/d8-*.html).
//   node scripts/build-vitrines.mjs            — собрать все
//   node scripts/build-vitrines.mjs d8-myths   — одну
// Каждая витрина — один самодостаточный HTML, как прежние: кит (kit.css, kit.js) и арт игры
// (карты, Знамения, Затмения, туманности — тем же кодом, что игра, через vitrine-art.mjs)
// вшиваются внутрь. В HTML попадают только картинки, имена которых встречаются в исходнике
// витрины, плюс 36 обычных карт.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'docs/vitrines/src');
const out = path.join(root, 'docs/vitrines');
const art = path.join(os.tmpdir(), 'starweave-vitrine-art');

if (!existsSync(path.join(art, 'card-sun-1.webp')) && !existsSync(path.join(art, 'card-sun-1.png'))) {
  execFileSync('node', [path.join(root, 'scripts/vitrine-art.mjs'), art], { stdio: 'inherit' });
}
const artFiles = await readdir(art);
const artByName = new Map(artFiles.map((f) => [f.replace(/\.(webp|png|jpg)$/, ''), f]));

const kitCss = await readFile(path.join(src, 'kit.css'), 'utf8');
const kitJs = await readFile(path.join(src, 'kit.js'), 'utf8');
const only = process.argv[2];
const pages = (await readdir(src)).filter((f) => f.endsWith('.html') && (!only || f.startsWith(only)));

for (const page of pages) {
  const html = await readFile(path.join(src, page), 'utf8');
  const used = new Set(html.match(/\b(?:card|omen|boss|chart|ritual|pack|nebula|back)-[A-Za-z0-9-]+/g) ?? []);
  for (const s of ['sun', 'moon', 'star', 'comet']) for (let r = 1; r <= 9; r++) used.add(`card-${s}-${r}`);
  const map = {};
  for (const name of used) {
    const file = artByName.get(name);
    if (!file) continue;
    const ext = path.extname(file).slice(1);
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    map[name] = `data:${mime};base64,${(await readFile(path.join(art, file))).toString('base64')}`;
  }
  const head =
    '<meta name="claude:viewport-fit-sides" content="cover">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Forum&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
    `<style>\n${kitCss}\n</style>`;
  const script = `<script>\nconst ART = ${JSON.stringify(map)};\n${kitJs}\n</script>`;
  const built = html.replace('<!--KIT-->', head).replace('<!--KITJS-->', script);
  await writeFile(path.join(out, page), built);
  console.log(`${page}: ${Math.round(built.length / 1024)} КБ, ${Object.keys(map).length} картинок`);
}
