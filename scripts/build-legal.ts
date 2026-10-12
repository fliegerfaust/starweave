// Собирает публичные страницы политики и соглашения для карточек в сторах:
// public/legal/privacy.html и public/legal/terms.html (русский и английский на одной странице).
// Запуск: node scripts/build-legal.ts (Node 22.6+ сам понимает TypeScript).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { markdownToHtml } from '../src/legal/markdown.ts';

const vars = JSON.parse(readFileSync('legal/config.json', 'utf8')) as Record<string, string>;
const page = (title: string, ru: string, en: string) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="icon" href="../favicon.png" />
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #05061a; color: #eae6ff; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font: 400 34px/1.2 'Times New Roman', serif; color: #f6c25b; }
  h2 { font-size: 20px; margin-top: 28px; }
  a { color: #7fe0ff; }
  nav { display: flex; gap: 16px; margin-bottom: 8px; }
  hr { border: 0; border-top: 1px solid rgba(160,150,255,.25); margin: 48px 0; }
</style>
</head>
<body><main>
<nav><a href="#ru">Русский</a><a href="#en">English</a></nav>
<section id="ru">${markdownToHtml(ru, vars)}</section>
<hr />
<section id="en" lang="en">${markdownToHtml(en, vars)}</section>
</main></body>
</html>
`;

mkdirSync('public/legal', { recursive: true });
for (const doc of ['privacy', 'terms'] as const) {
  const ru = readFileSync(`legal/${doc}.ru.md`, 'utf8');
  const en = readFileSync(`legal/${doc}.en.md`, 'utf8');
  const title = doc === 'privacy' ? 'Звёздное плетение — Политика конфиденциальности' : 'Звёздное плетение — Пользовательское соглашение';
  writeFileSync(`public/legal/${doc}.html`, page(title, ru, en));
}
const missing = Object.values(vars).filter((v) => v.startsWith('['));
if (missing.length) console.warn('⚠ legal/config.json: заполните оператора и почту перед публикацией');
console.log('public/legal/privacy.html, public/legal/terms.html готовы');
