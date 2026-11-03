import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { maxTextLength, TEXT_GROUPS, TEXT_PROBLEM_RU, textCatalog, type TextLang, type TextProblem } from '../../src/i18n/texts.ts';
import { CSS, esc, FONTS } from './dashboard.ts';
import type { Db } from './db.ts';
import { history, needsTranslation, overrides } from './texts.ts';

/**
 * Редактор текстов обучения (TX.3) — рядом со сводкой, за тем же паролем. Денис правит
 * русские реплики, английский — Claude. Каждый текст — своя форма: поле, предпросмотр, как
 * в игре (*действие* золотом, {n} подставлен), проверка на лету и история с откатом.
 * Работает и без скрипта: проверка всё равно на сервере.
 */

/** Что игра подставит вместо {…} — для предпросмотра. */
const SAMPLE: Record<string, string> = { n: '150', total: '8' };

const when = (ts: number) => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const who = (a: string) => (a === 'denis' ? 'Денис' : a === 'claude' ? 'Claude' : a);

/** Реплика как в игре: действие золотом, подстановки — примером. */
function preview(text: string): string {
  return esc(text)
    .replace(/\{(\w+)\}/g, (_, k: string) => `<i>${esc(SAMPLE[k] ?? k)}</i>`)
    .split('*')
    .map((part, i) => (i % 2 ? `<b>${part}</b>` : part))
    .join('');
}

export interface TextsPageOpts {
  lang: TextLang;
  /** Только что сохранённый ключ — у него «Сохранено». */
  saved?: string;
  /** Неудачная правка: ключ, введённый текст и что не так. */
  error?: { key: string; value: string; problem: TextProblem | 'key' | 'log' };
}

export function renderTextsPage(db: Db, opts: TextsPageOpts): string {
  const { lang } = opts;
  const mine = overrides(db, lang);
  const ru = overrides(db, 'ru');
  const ruDefault = new Map(textCatalog('ru').map((e) => [e.key, e.value]));
  const needs = new Set(needsTranslation(db));
  const catalog = textCatalog(lang);
  const changed = Object.keys(mine).length;

  const row = (key: string, def: string): string => {
    const stored = mine[key] ?? def;
    const err = opts.error?.key === key ? opts.error : undefined;
    const value = err?.value ?? stored;
    const last = history(db, lang, key);
    const status = err
      ? `<span class="st hot">Не сохранено</span>`
      : opts.saved === key
        ? `<span class="st good">Сохранено</span>`
        : lang === 'en' && needs.has(key)
          ? `<span class="st hot">Нужен перевод</span>`
          : key in mine
            ? `<span class="st tick">Изменён${last[0] ? ` ${esc(when(last[0].at))}, ${esc(who(last[0].author))}` : ''}</span>`
            : `<span class="st faint">Как в сборке</span>`;
    const problem = err ? (err.problem === 'key' ? 'Такого текста в игре нет' : err.problem === 'log' ? 'Этой правки нет в истории' : TEXT_PROBLEM_RU[err.problem]) : '';
    const source = lang === 'en' ? `<p class="tx-src"><span>Русский</span>${preview(ru[key] ?? ruDefault.get(key) ?? '')}</p>` : '';
    const log = last.length
      ? `<ol class="tx-log">${last
          .map((l) => `<li><span class="faint">${esc(when(l.at))} · ${esc(who(l.author))}</span><span class="tx-old">${l.value === null ? '<em>текст по умолчанию</em>' : preview(l.value)}</span>${(l.value ?? def) === stored ? '<span class="faint small">сейчас</span>' : `<button class="link" name="op" value="revert:${l.id}">Вернуть</button>`}</li>`)
          .join('')}</ol>`
      : '';
    // Предпросмотр нужен, только где есть *действие* или {подстановка}: иначе он повторяет поле
    const marked = (v: string) => /[*{]/.test(v);
    return `<form class="tx${err ? ' dirty' : ''}" id="${esc(key)}" method="post" action="/stats/texts" data-def="${esc(def)}" data-max="${maxTextLength(def)}" data-init="${esc(stored)}">
  <input type="hidden" name="lang" value="${lang}"><input type="hidden" name="key" value="${esc(key)}">
  <div class="tx-head"><label for="v-${esc(key)}"><code>${esc(key)}</code></label>${status}<span class="tx-count faint small">${value.length} / ${maxTextLength(def)}</span></div>
  ${source}
  <textarea id="v-${esc(key)}" name="value" rows="1" spellcheck="true" lang="${lang}">${esc(value)}</textarea>
  <p class="tx-pv" aria-label="Как в игре"${marked(value) ? '' : ' hidden'}>${preview(value)}</p>
  <p class="tx-msg${problem ? ' hot' : ''}" role="status">${esc(problem)}</p>
  <div class="tx-foot">
    <details class="tx-more"><summary>По умолчанию${last.length ? ' и история' : ''}</summary><p class="tx-def">${preview(def)}</p>${log}</details>
    ${key in mine ? '<button class="ghost" name="op" value="reset">По умолчанию</button>' : ''}
    ${lang === 'en' && needs.has(key) && !err ? '<button class="ghost" name="op" value="ok">Перевод верен</button>' : ''}
    <button name="op" value="save"${err ? '' : ' disabled'}>Сохранить</button>
  </div>
</form>`;
  };

  const groups = TEXT_GROUPS.map((g) => {
    const rows = catalog.filter((e) => e.group === g.id).map((e) => row(e.key, e.value)).join('');
    return `<section class="tx-group"><h2>${esc(g.title)}</h2>${rows}</section>`;
  }).join('');

  const tab = (l: TextLang, label: string) => `<a href="?lang=${l}"${l === lang ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<!-- Поверх no-referrer из Caddy: форма редактора уходит со своим Origin -->
<meta name="referrer" content="same-origin">
<title>Звёздное плетение · тексты обучения</title>
<style>${FONTS}${CSS}${TEXTS_CSS}</style>
</head>
<body>
<div class="wrap tx-wrap">
<header class="top">
  <div><h1>Тексты обучения</h1><p class="faint">${changed ? `Изменено ${changed} из ${catalog.length}` : `Все ${catalog.length} как в сборке`} · игроки увидят правку со следующего запуска игры</p></div>
  <nav class="period" aria-label="Язык">${tab('ru', 'Русский')}${tab('en', needs.size ? `English · ${needs.size} к переводу` : 'English')}<a href="/stats">Сводка</a></nav>
</header>
<p class="tx-how">Звёздочками <code>*…*</code> выделено действие: в игре оно золотое. <code>{n}</code> и <code>{total}</code> игра подставит сама, их не трогай. Сохранить можно и сочетанием <kbd>⌘</kbd>+<kbd>Enter</kbd>.</p>
<main>${groups}</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const TEXTS_CSS = `
.tx-wrap{max-width:860px}
.tx-how{color:var(--dim);margin:18px 0 0;max-width:68ch}
kbd{font:600 12px var(--fb);padding:1px 6px;border-radius:5px;box-shadow:inset 0 0 0 1px var(--hair);color:var(--ink)}
.tx-group{padding:28px 0 0}
.tx-group h2{font-size:22px;color:var(--gold-hi);margin-bottom:2px}
.tx{display:grid;gap:6px;padding:14px 0 10px;border-bottom:1px solid var(--line);scroll-margin-top:16px}
.tx-head{display:flex;align-items:baseline;gap:12px}
.tx-head code{font-size:13px;color:var(--dim)}
.tx-head .tx-count{margin-left:auto}
.st{font-size:12px}
.tx-src{margin:0;color:var(--dim);font-size:13px}.tx-src span{display:inline-block;margin-right:8px;color:var(--faint);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
textarea{width:100%;min-height:44px;resize:vertical;padding:10px 12px;border-radius:10px;border:0;background:rgb(8 7 26/.7);
box-shadow:inset 0 0 0 1px var(--hair);color:var(--ink);font:400 15px/1.5 var(--fb);overflow:hidden}
textarea:focus-visible{outline:none;box-shadow:inset 0 0 0 1.5px var(--gold)}
.tx-pv{margin:0;padding:0 0 0 12px;border-left:2px solid var(--hair);color:var(--ink);font-size:14px}
.tx-pv b,.tx-def b,.tx-old b,.tx-src b{color:var(--gold);font-weight:700}
.tx-pv i,.tx-def i,.tx-old i,.tx-src i{font-style:normal;color:var(--light)}
.tx-msg{margin:0;font-size:13px}.tx-msg:empty{display:none}
.tx-count.hot{color:var(--mult)}
.tx-foot{display:flex;align-items:start;gap:10px;flex-wrap:wrap}
.tx-more{flex:1 1 auto;padding-top:6px}
button{font:700 13px var(--fb);min-height:34px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;color:var(--n0);background:var(--gold)}
button:disabled{cursor:default;color:var(--faint);background:rgb(234 230 255/.07)}
button.ghost{color:var(--ink);background:none;box-shadow:inset 0 0 0 1px var(--hair)}
button.link{min-height:28px;padding:0 4px;color:var(--light);background:none;font-weight:600}
button:focus-visible{outline:2px solid var(--gold-hi);outline-offset:2px}
/* «Сохранить» — только у текста, который правят: 66 серых кнопок подряд — шум. Место держится, строка не прыгает */
.js .tx:not(.dirty) button[value=save]{visibility:hidden}
.tx-more summary{cursor:pointer;color:var(--dim);font-size:12px;width:max-content}
.tx-def{margin:8px 0 0;color:var(--dim)}
.tx-log{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.tx-log li{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:10px;align-items:baseline;font-size:13px}
.tx-old{color:var(--dim)}
@media (max-width:640px){.tx-log li{grid-template-columns:minmax(0,1fr) auto}.tx-log li>.faint:first-child{grid-column:1/-1}
.tx-head{flex-wrap:wrap;gap:4px 12px}.js .tx:not(.dirty) button[value=save]{display:none}}
`;

/** Предпросмотр и проверка на лету: те же правила, что на сервере и в игре (`texts.ts`). */
const SCRIPT = `(()=>{
document.documentElement.classList.add('js');
const SAMPLE=${JSON.stringify(SAMPLE)},PROBLEM=${JSON.stringify(TEXT_PROBLEM_RU)};
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const vars=s=>[...new Set([...s.matchAll(/\\{(\\w+)\\}/g)].map(m=>m[1]))].sort().join();
const check=(def,v,max)=>!v.trim()?'empty':vars(v)!==vars(def)?'vars':(v.split('*').length-1)%2?'stars':v.includes('\\u2014')?'dash':/[<>]/.test(v)?'markup':v.length>max?'long':null;
const pv=t=>esc(t).replace(/\\{(\\w+)\\}/g,(_,k)=>'<i>'+esc(SAMPLE[k]||k)+'</i>').split('*').map((p,i)=>i%2?'<b>'+p+'</b>':p).join('');
for(const f of document.querySelectorAll('form.tx')){
  const ta=f.querySelector('textarea'),out=f.querySelector('.tx-pv'),cnt=f.querySelector('.tx-count'),msg=f.querySelector('.tx-msg'),save=f.querySelector('button[value=save]');
  const def=f.dataset.def,max=+f.dataset.max,init=f.dataset.init;
  const fit=()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+2+'px';};
  ta.addEventListener('input',()=>{
    const v=ta.value.replace(/\\s+/g,' ').trim(),p=check(def,v,max);
    out.innerHTML=pv(v);out.hidden=!/[*{]/.test(v);cnt.textContent=v.length+' / '+max;cnt.classList.toggle('hot',v.length>max);
    msg.textContent=p?PROBLEM[p]:'';msg.classList.toggle('hot',!!p);save.disabled=!!p||v===init;f.classList.toggle('dirty',v!==init);fit();
  });
  ta.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!save.disabled){e.preventDefault();f.requestSubmit(save);}});
  fit();
}
})();`;

export const TEXTS_SCRIPT_HASH = `sha256-${createHash('sha256').update(SCRIPT).digest('base64')}`;

/**
 * Запись из редактора — только со своей страницы: браузер подставил бы пароль Basic и в форму с
 * чужого сайта. Caddy отдаёт API с `Referrer-Policy: no-referrer`, а с ней браузер шлёт форму
 * с `Origin: null` (релизная проверка 0.7.20). Тогда своё подтверждает `Sec-Fetch-Site:
 * same-origin`: этот заголовок ставит сам браузер, страница его подделать не может.
 */
export function sameOrigin(h: IncomingHttpHeaders): boolean {
  const site = h['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  if (h.origin === 'null') return site === 'same-origin';
  try {
    return new URL(h.origin ?? '').host === h.host;
  } catch {
    return false;
  }
}

/** Ответ после сохранения: обратно к тому же тексту с пометкой. */
export function savedLocation(lang: TextLang, key: string): string {
  return `/stats/texts?lang=${lang}&saved=${encodeURIComponent(key)}#${encodeURIComponent(key)}`;
}

