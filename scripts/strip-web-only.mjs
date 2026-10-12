// Убирает из сборки для порталов то, что нужно только своему сайту: офлайн-кэш,
// манифест PWA, иконки «На экран Домой» и карты исходников (*.map). Порталы (Яндекс Игры) раздают файлы сами,
// а лишний service worker в их iframe только мешает.
// Запуск: node scripts/strip-web-only.mjs <папка сборки>
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/strip-web-only.mjs <dist>');

for (const file of ['sw.js', 'manifest.webmanifest', 'icons']) rmSync(join(dir, file), { recursive: true, force: true });
for (const file of readdirSync(join(dir, 'assets'))) if (file.endsWith('.map')) rmSync(join(dir, 'assets', file));

const indexPath = join(dir, 'index.html');
const html = readFileSync(indexPath, 'utf8')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\s*<meta name="apple-mobile-web-app-[^>]*>/g, '');
writeFileSync(indexPath, html);
console.log(`${dir}: убраны sw.js, манифест, иконки PWA и карты исходников`);
