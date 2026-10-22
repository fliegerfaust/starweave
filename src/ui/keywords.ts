import { dict, named } from '@/i18n';
import { h } from './dom';
import { rich } from './rich';

/**
 * Ключевые слова механики (RT.4, витрина d8-route-wonders, выбор Дениса 22.10.2026).
 * Разметка в строках словаря:
 *   [слово|ключ|цвет] — выделенное слово; касание открывает подсказку. Ключ — id глифа
 *     (`glass`), правило из `kw.rule` (`mult`) или Знамение (`omen.crossroads`). Цвет
 *     необязателен: `light`, `mult`, `xmult`, `gold` — как плашки формулы.
 *   {-Глагол} / {+Глагол} — глагол цены в начале строки: платишь розовым, получаешь золотым.
 * Слово внутри подсказки открывает следующую в той же табличке; «← Назад» возвращает.
 */
const MARK = /\[([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]|\{([+-])([^}]+)\}/g;

/** Число не отрывается ни от своего слова, ни от короткого предлога перед ним. */
const glue = (s: string) => s.replace(/(^|\s)(\S{1,3}) (\d)/g, '$1$2 $3').replace(/(\d) (\S)/g, '$1 $2');

export function kwText(raw: string): HTMLElement {
  const src = glue(raw);
  const out = h('span.kw-text');
  let last = 0;
  for (const m of src.matchAll(MARK)) {
    out.append(src.slice(last, m.index));
    if (m[4]) out.append(h(`span.kw-verb${m[4] === '+' ? '.plus' : ''}`, null, m[5]!));
    else out.append(h(`span.kw${m[3] ? `.${m[3]}` : ''}`, { attrs: { 'data-kw': m[2]!, role: 'button', tabindex: '0' } }, m[1]!));
    last = (m.index ?? 0) + m[0].length;
  }
  out.append(src.slice(last));
  return out;
}

interface Def {
  kind: string;
  name: string;
  body: HTMLElement;
}

function define(key: string): Def | null {
  const d = dict();
  if (key.startsWith('omen.')) {
    const { name, desc } = named('omen', key.slice(5));
    return desc ? { kind: d.kw.kinds.omen, name, body: rich(desc) } : null;
  }
  const glyph = (d.kw.glyph as Record<string, string | undefined>)[key];
  if (glyph) return { kind: d.kw.kinds.glyph, name: (d.glyph as Record<string, string | undefined>)[key] ?? key, body: kwText(glyph) };
  const [name, desc] = (d.kw.rule as Record<string, readonly string[] | undefined>)[key] ?? [];
  return name && desc ? { kind: d.kw.kinds.rule, name, body: kwText(desc) } : null;
}

interface Open {
  anchor: HTMLElement;
  stack: string[];
  tip: HTMLElement;
  below?: boolean;
}
let open: Open | null = null;

export function closeKeyword(): void {
  open?.tip.remove();
  open?.anchor.classList.remove('on');
  open = null;
}

function openKeyword(anchor: HTMLElement): void {
  closeKeyword();
  const key = anchor.dataset.kw!;
  if (!define(key)) return;
  anchor.classList.add('on');
  open = { anchor, stack: [key], tip: h('div.kw-hint', { attrs: { role: 'dialog' } }) };
  document.getElementById('ui')!.append(open.tip);
  paint(0);
}

function step(key: string | null): void {
  if (!open) return;
  if (key === null) open.stack.pop();
  else if (open.stack.at(-1) !== key && define(key)) open.stack.push(key);
  else return;
  paint(key === null ? -1 : 1);
}

function paint(dir: number): void {
  const st = open!;
  const def = define(st.stack.at(-1)!)!;
  const prev = st.stack.at(-2);
  const back = prev ? h('button.kw-back', { type: 'button', onclick: (e: Event) => { e.stopPropagation(); step(null); } }, `← ${define(prev)!.name}`) : null;
  const body = h('div.kw-body', null, [back, h('small', null, def.kind), h('b', null, def.name), h('p', null, def.body)]);
  body.style.setProperty('--dx', `${dir < 0 ? -8 : 8}px`);
  if (!dir) body.style.animation = 'none';
  st.tip.replaceChildren(body);
  place(st);
}

/** Сторона выбирается при открытии и не меняется в цепочке: табличка растёт от слова, не прыгает. */
function place(st: Open): void {
  const r = st.anchor.getBoundingClientRect();
  const tw = st.tip.offsetWidth;
  const th = st.tip.offsetHeight;
  const x = Math.min(innerWidth - tw - 10, Math.max(10, r.left + r.width / 2 - tw / 2));
  st.below ??= r.bottom + 12 + th + 60 < innerHeight - 10;
  st.tip.classList.toggle('below', st.below);
  st.tip.classList.toggle('above', !st.below);
  st.tip.style.left = `${x}px`;
  st.tip.style.top = `${st.below ? r.bottom + 10 : Math.max(10, r.top - th - 10)}px`;
  st.tip.style.setProperty('--nose', `${Math.min(tw - 16, Math.max(16, r.left + r.width / 2 - x))}px`);
}

// Одно делегирование на весь интерфейс: касание слова, слово в подсказке, касание мимо
document.addEventListener('click', (e) => {
  const kw = (e.target as HTMLElement).closest?.<HTMLElement>('.kw');
  if (kw?.closest('.kw-hint')) step(kw.dataset.kw!);
  else if (kw) openKeyword(kw);
});
document.addEventListener('pointerdown', (e) => {
  const el = e.target as HTMLElement;
  if (open && !el.closest?.('.kw-hint') && !el.closest?.('.kw')) closeKeyword();
});
document.addEventListener('keydown', (e) => {
  const kw = (e.target as HTMLElement).closest?.<HTMLElement>('.kw');
  if (kw && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    kw.click();
  } else if (e.key === 'Escape') closeKeyword();
});
