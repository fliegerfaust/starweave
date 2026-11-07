// Сборка Android (APK.6): убирает шрифты, которые приложению не нужны. WebView понимает woff2,
// запасные woff не грузятся никогда; греческий и вьетнамский алфавиты в игре не встречаются.
// Запуск: node scripts/slim-android.mjs <папка сборки>
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/slim-android.mjs <dist>');
let saved = 0;
for (const file of readdirSync(join(dir, 'assets'))) {
  if (!/\.woff$|-(greek|vietnamese)-/.test(file)) continue;
  const path = join(dir, 'assets', file);
  saved += statSync(path).size;
  rmSync(path);
}
console.log(`${dir}: убраны лишние шрифты, ${Math.round(saved / 1024)} КБ`);
