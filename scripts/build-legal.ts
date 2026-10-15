// Собирает публичные страницы политики и соглашения для карточек в сторах:
// public/legal/privacy.html и public/legal/terms.html — «Табличка» (RD.11): шапка-табличка в
// языке игры, язык переключателем (по умолчанию — язык браузера), разделы с номером в кольце.
// Шрифты лежат рядом (public/legal/fonts), а не на Google Fonts: страница политики не должна
// сама отдавать IP посетителя третьей стороне.
// Запуск: node scripts/build-legal.ts (Node 22.6+ сам понимает TypeScript).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { markdownToHtml } from '../src/legal/markdown.ts';

type Doc = 'privacy' | 'terms';
type Lang = 'ru' | 'en';

const vars = JSON.parse(readFileSync('legal/config.json', 'utf8')) as Record<string, string>;
const UI = {
  ru: { game: 'Звёздное плетение', other: { privacy: 'Пользовательское соглашение', terms: 'Политика конфиденциальности' } },
  en: { game: 'Starweave', other: { privacy: 'Terms of Use', terms: 'Privacy Policy' } },
} as const;
const ICON = {
  doc: '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
};
const icon = (name: keyof typeof ICON) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

/** Один язык документа: шапка-табличка, текст с номерами разделов, второй документ и почта. */
function section(doc: Doc, lang: Lang): string {
  const html = markdownToHtml(readFileSync(`legal/${doc}.${lang}.md`, 'utf8'), vars);
  const title = /<h1>(.*?)<\/h1>/.exec(html)![1]!.replace(/ игры «Звёздное плетение»|^Starweave /, '');
  const edition = /<\/h1>\s*<p>(.*?)<\/p>/.exec(html)![1]!;
  const body = html
    .replace(/<h1>.*?<\/h1>\s*<p>.*?<\/p>/, '')
    .replace(/<h2>(\d+)\.\s*/g, '<h2><span class="n">$1</span>');
  const ui = UI[lang];
  const other: Doc = doc === 'privacy' ? 'terms' : 'privacy';
  return `<section id="${lang}" lang="${lang}">
<header class="head">
  <span class="mark">${ui.game}</span>
  <h1>${title}</h1>
  <div class="sill"></div>
  <div class="row"><span class="ed">${edition}</span><span class="langs"><a href="#ru" data-lang="ru"${lang === 'ru' ? ' class="on"' : ''}>Русский</a><a href="#en" data-lang="en"${lang === 'en' ? ' class="on"' : ''}>English</a></span></div>
</header>
<div class="doc">${body}</div>
<footer class="other"><a href="${other}.html#${lang}">${icon('doc')}${ui.other[doc]}</a><a href="mailto:${vars.email}">${icon('mail')}${vars.email}</a></footer>
</section>`;
}

const page = (doc: Doc) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#05061a" />
<meta name="format-detection" content="telephone=no" />
<title>${UI.ru.game} — ${doc === 'privacy' ? 'Политика конфиденциальности' : 'Пользовательское соглашение'}</title>
<link rel="icon" href="../favicon.png" />
<style>
  @font-face { font-family: 'Forum'; font-display: swap; src: url(fonts/forum-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Forum'; font-display: swap; src: url(fonts/forum-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+2215; }
  @font-face { font-family: 'Manrope'; font-display: swap; font-weight: 200 800; src: url(fonts/manrope-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Manrope'; font-display: swap; font-weight: 200 800; src: url(fonts/manrope-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+2215; }
  :root { color-scheme: dark; --gold: #f6c25b; --gold-hi: #ffe6a8; --ink: #eae6ff; --ink-dim: #b3aedb; --ink-faint: #8a85b8; --brass: rgb(246 194 91 / 0.3); --hair: rgb(246 194 91 / 0.16); }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(70% 40% at 50% 0%, #15123d, #05061a 70%) no-repeat, #05061a; color: var(--ink); font: 400 16px/1.65 'Manrope', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  ::selection { background: rgb(246 194 91 / 0.35); }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 8px; }
  a { color: var(--gold-hi); text-decoration-color: rgb(246 194 91 / 0.5); text-underline-offset: 3px; }
  main { max-width: 700px; margin: 0 auto; padding: calc(28px + env(safe-area-inset-top, 0px)) calc(20px + env(safe-area-inset-right, 0px)) calc(56px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px)); }
  /* Без скрипта видны оба языка подряд; со скриптом — выбранный */
  html.js section:not(.on) { display: none; }
  html:not(.js) section + section { margin-top: 64px; }
  .head { display: grid; justify-items: center; gap: 12px; margin-bottom: 26px; text-align: center; }
  .mark { font: 400 13px/1 'Forum', 'Times New Roman', serif; letter-spacing: 0.3em; text-transform: uppercase; color: rgb(255 230 168 / 0.75); }
  h1 { margin: 0; font: 400 clamp(22px, 6.2vw, 38px)/1.12 'Forum', 'Times New Roman', serif; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gold-hi); text-wrap: balance; }
  .sill { width: min(420px, 90%); height: 1.5px; background: radial-gradient(closest-side, rgb(255 230 168 / 0.9), transparent); }
  .row { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px 16px; }
  .ed { color: var(--ink-faint); font-size: 13.5px; }
  .langs { display: inline-flex; padding: 3px; border-radius: 999px; box-shadow: inset 0 0 0 1px var(--hair); }
  .langs a { min-height: 36px; padding: 0 14px; display: inline-flex; align-items: center; border-radius: 999px; font: 700 13px/1 'Manrope', system-ui, sans-serif; color: var(--ink-dim); text-decoration: none; }
  .langs a.on { color: #1a1206; background: var(--gold); }
  .doc p { margin: 0 0 12px; text-wrap: pretty; }
  .doc ul { margin: 0 0 14px; padding: 0; list-style: none; display: grid; gap: 10px; }
  .doc li { position: relative; padding-left: 22px; text-wrap: pretty; }
  .doc li::before { content: ''; position: absolute; left: 4px; top: 0.72em; width: 6px; height: 6px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 6px rgb(246 194 91 / 0.6); }
  .doc strong { color: var(--gold-hi); font-weight: 700; }
  .doc h2 { margin: 30px 0 12px; display: flex; align-items: center; gap: 12px; font: 400 15px/1.2 'Forum', 'Times New Roman', serif; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold-hi); }
  .doc h2 .n { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 800 13px/1 'Manrope', system-ui, sans-serif; letter-spacing: 0; color: var(--gold); box-shadow: inset 0 0 0 1px var(--brass); }
  .doc h2::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--hair), transparent); }
  .other { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; padding-top: 14px; margin-top: 30px; box-shadow: 0 -1px 0 var(--hair); font-size: 14px; }
  .other a { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; overflow-wrap: anywhere; }
  .icon { flex: none; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
</style>
<script>
  // Язык: из адреса (#ru, #en), иначе — язык браузера
  (function () {
    var root = document.documentElement;
    root.classList.add('js');
    function pick() {
      var lang = location.hash === '#en' || (location.hash !== '#ru' && !/^ru\\b/i.test(navigator.language || '')) ? 'en' : 'ru';
      root.lang = lang;
      document.querySelectorAll('section').forEach(function (s) { s.classList.toggle('on', s.id === lang); });
      window.scrollTo(0, 0);
    }
    addEventListener('hashchange', pick);
    addEventListener('DOMContentLoaded', pick);
  })();
</script>
</head>
<body><main>
${section(doc, 'ru')}
${section(doc, 'en')}
</main></body>
</html>
`;

mkdirSync('public/legal/fonts', { recursive: true });
const FONTS: [string, string][] = [
  ['@fontsource/forum/files/forum-cyrillic-400-normal.woff2', 'forum-cyrillic.woff2'],
  ['@fontsource/forum/files/forum-latin-400-normal.woff2', 'forum-latin.woff2'],
  ['@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2', 'manrope-cyrillic.woff2'],
  ['@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', 'manrope-latin.woff2'],
];
for (const [from, to] of FONTS) copyFileSync(`node_modules/${from}`, `public/legal/fonts/${to}`);
for (const doc of ['privacy', 'terms'] as const) writeFileSync(`public/legal/${doc}.html`, page(doc));
const missing = Object.values(vars).filter((v) => v.startsWith('['));
if (missing.length) console.warn('⚠ legal/config.json: заполните оператора и почту перед публикацией');
console.log('public/legal/privacy.html, public/legal/terms.html готовы');
