import { chartIcon, omenSigil } from '@/art/sigil';
import type { Choice } from '@/core/choices';
import { MAX_RANK, MIN_RANK, type Card, type ComboId, type RunState } from '@/core/types';
import type { CometTrade, ScopeUpgrade } from '@/core/wonders';
import type { App } from '@/game/app';
import { named, t } from '@/i18n';
import { canvasImg, dpr, h } from './dom';
import { closeKeyword, kwText } from './keywords';
import { sceneRibbon, sceneWindow } from './scene-window';
import { cardThumb } from './screens/common';
import { button, type ModalHandle } from './widgets';

type Wonder = Extract<Choice, { kind: 'comet' | 'telescope' }>;

export interface WonderHandlers {
  take(index: number): void;
  skip(): void;
}

/**
 * Строка: слева знак обмена на игровых элементах («отдаёшь → получаешь») в рамках постоянного
 * размера, справа две строки текстом — что получаешь и за что. Подписей над картинками нет:
 * высота строки не зависит от обмена.
 */
interface Row {
  give: HTMLElement[];
  get: HTMLElement[];
  gain: string;
  cost: string;
}

/** Размер элементов по форме экрана: рисуются в своём размере, растр не растягивается. */
const SIZES = (): [number, number, number] => {
  if (matchMedia('(min-width: 900px) and (min-height: 600px)').matches) return [60, 68, 62];
  if (matchMedia('(min-height: 740px) and (max-width: 899px)').matches) return [44, 50, 48];
  return [34, 38, 36];
};
let CARD_W = 34;
let SIGIL = 38;
let CHART = 36;
const cardName = (c: Pick<Card, 'rank' | 'suit'>) => `${c.rank} ${t(`suitPl.${c.suit}`)}`;
const coin = () => h('span.coin', { attrs: { 'aria-hidden': 'true' } });
const badge = (text: string, minus = false) => h(`span.wd-badge${minus ? '.minus' : ''}`, null, text);

const item = {
  gold: (n: number, minus = false) => h('div.wd-it', null, h(`span.wd-coins${minus ? '.minus' : ''}`, null, [`${minus ? '−' : '+'}${n}`, coin()])),
  card: (c: Card, mark?: HTMLElement) => h('div.wd-it', null, [cardThumb(c, CARD_W), mark ?? null]),
  gone: (c: Card) => h('div.wd-it.gone', null, cardThumb(c, CARD_W)),
  omen: (id: string) => h('div.wd-it', null, canvasImg(omenSigil(id, SIGIL, dpr()), SIGIL)),
  chart: (combo: ComboId, mark: HTMLElement) => h('div.wd-it', null, [canvasImg(chartIcon(combo, CHART, dpr()), CHART), mark]),
};

type Lines = { gain: string; cost: string };
const lines = (key: string, vars: Record<string, string | number>): Lines => ({
  gain: t(`${key}.gain` as 'wonder.comet.goldForOmen.gain', vars),
  cost: t(`${key}.cost` as 'wonder.comet.goldForOmen.cost', vars),
});

function cometRow(run: RunState, tr: CometTrade): Row {
  const card = (id: number) => run.deck.find((c) => c.id === id)!;
  const omenOf = (uid: number) => run.omens.find((o) => o.uid === uid)!.id;
  const w = (k: string, vars: Record<string, string | number>) => lines(`wonder.comet.${k}`, vars);
  switch (tr.e) {
    case 'goldForOmen':
      return { give: [item.gold(tr.gold, true)], get: [item.omen(tr.omen)], ...w('goldForOmen', { gold: tr.gold, omen: named('omen', tr.omen).name, id: tr.omen }) };
    case 'cardForGlyph': {
      const give = card(tr.give);
      const target = card(tr.target);
      return { give: [item.gone(give)], get: [item.card({ ...target, glyph: tr.glyph })], ...w('cardForGlyph', { give: cardName(give), target: cardName(target), glyph: t(`glyph.${tr.glyph}`), glyphId: tr.glyph }) };
    }
    case 'omenForGold': {
      const id = omenOf(tr.uid);
      return { give: [item.omen(id)], get: [item.gold(tr.gold)], ...w('omenForGold', { omen: named('omen', id).name, id, gold: tr.gold }) };
    }
    case 'goldForChart':
      return { give: [item.gold(tr.gold, true)], get: [item.chart(tr.combo, badge('+2'))], ...w('goldForChart', { gold: tr.gold, combo: t(`combo.${tr.combo}`) }) };
    case 'rankShift': {
      const down = card(tr.down);
      const up = card(tr.up);
      const downTo = Math.max(MIN_RANK, down.rank - 2);
      const upTo = Math.min(MAX_RANK, up.rank + 2);
      return { give: [item.card(down, badge('−2', true))], get: [item.card(up, badge('+2'))], ...w('rankShift', { down: cardName(down), up: cardName(up), downTo, upTo }) };
    }
    case 'suitShift': {
      const cs = tr.cards.map(card);
      return { give: cs.map((c) => item.card(c)), get: cs.map((c) => item.card({ ...c, suit: tr.suit })), ...w('suitShift', { suit: t(`suit.${tr.suit}`), a: cardName(cs[0]!), b: cardName(cs[1]!) }) };
    }
    case 'goldForBanish': {
      const cs = tr.cards.map(card);
      return { give: [item.gold(tr.gold, true)], get: cs.map(item.gone), ...w('goldForBanish', { gold: tr.gold, a: cardName(cs[0]!), b: cardName(cs[1]!) }) };
    }
    case 'chartSwap':
      return { give: [item.chart(tr.from, badge('−1', true))], get: [item.chart(tr.to, badge('+2'))], ...w('chartSwap', { from: t(`combo.${tr.from}`), to: t(`combo.${tr.to}`) }) };
    case 'goldForCopy': {
      const c = card(tr.card);
      return { give: [item.gold(tr.gold, true)], get: [item.card(c, badge('×2'))], ...w('goldForCopy', { gold: tr.gold, card: cardName(c) }) };
    }
    case 'omenForOmen': {
      const id = omenOf(tr.uid);
      return { give: [item.omen(id)], get: [item.omen(tr.omen)], ...w('omenForOmen', { a: named('omen', id).name, aid: id, b: named('omen', tr.omen).name, bid: tr.omen }) };
    }
  }
}

function scopeRow(run: RunState, u: ScopeUpgrade): Row {
  const card = (id: number) => run.deck.find((c) => c.id === id)!;
  if (u.u === 'chart') {
    const lv = run.comboLevels[u.combo];
    return { give: [item.chart(u.combo, badge(String(lv)))], get: [item.chart(u.combo, badge(String(lv + 1)))], ...lines('wonder.scope.chart', { combo: t(`combo.${u.combo}`), from: lv, to: lv + 1 }) };
  }
  const c = card(u.card);
  if (u.u === 'glyph') return { give: [item.card(c)], get: [item.card({ ...c, glyph: u.glyph })], ...lines('wonder.scope.glyph', { card: cardName(c), glyph: t(`glyph.${u.glyph}`), glyphId: u.glyph, short: t(`kw.short.${u.glyph}`) }) };
  return { give: [item.card(c)], get: [item.gone(c)], ...lines('wonder.scope.banish', { card: cardName(c), n: run.deck.length - 1 }) };
}

const SVG = 'http://www.w3.org/2000/svg';
function svgEl(cls: string, size: number, markup: string): SVGSVGElement {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', `0 0 ${size} ${size}`);
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = markup;
  return el;
}

/** Эмблема для ПК: латунная гравюра Кометы или Телескопа над названием. */
function emblem(comet: boolean): SVGSVGElement {
  const ring = '<circle cx="84" cy="84" r="80" fill="none" stroke="currentColor" stroke-opacity=".55"/><circle cx="84" cy="84" r="72" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="1 5"/>';
  const art = comet
    ? '<defs><linearGradient id="wd-ct" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff9a62" stop-opacity="0"/><stop offset="1" stop-color="#ffd2a0"/></linearGradient></defs><path d="M34 128 L106 58 L112 66 Z" fill="url(#wd-ct)"/><path d="M44 134 L108 62" stroke="#9ff0ff" stroke-opacity=".45" stroke-width="1.2"/><circle cx="110" cy="60" r="16" fill="#ffb37a" fill-opacity=".25"/><circle cx="110" cy="60" r="9" fill="#fff6e6"/><circle cx="52" cy="50" r="1.5" fill="currentColor"/><circle cx="128" cy="112" r="1.2" fill="currentColor"/><circle cx="70" cy="36" r="1" fill="currentColor"/>'
    : '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M44 104 L114 62 L122 76 L52 118 Z" fill="#14123a"/><path d="M114 62 L130 52 L138 66 L122 76" fill="#14123a"/><path d="M48 111 L36 118 L40 125 L52 118"/><path d="M84 92 L66 140 M84 92 L104 140 M84 92 L84 136"/></g><ellipse cx="134" cy="59" rx="4" ry="8" transform="rotate(-31 134 59)" fill="#9ff0ff" fill-opacity=".6"/><circle cx="140" cy="34" r="1.6" fill="currentColor"/><circle cx="122" cy="26" r="1" fill="currentColor"/><circle cx="148" cy="44" r="1.1" fill="currentColor"/>';
  return svgEl('wd-emblem', 168, ring + art);
}

/**
 * Вход. Комета летит вдоль своей оси (поворот задан до сдвига), хвост клином строго позади
 * головы, рядом тонкий ионный. Телескоп — окуляр: тёмное поле, прицельная сетка наводится на
 * резкость, круг обзора раскрывается на сцену. Только transform и opacity.
 */
function intro(comet: boolean): Element[] {
  const gone = (el: Element) => (el.addEventListener('animationend', (e) => e.target === el && el.remove()), el);
  if (comet) return [gone(h('div.wd-comet', { attrs: { 'aria-hidden': 'true' } }, [h('span.ion'), h('span.tail'), h('span.head')]))];
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const r1 = i % 9 === 0 ? 100 : 108;
    return `<line x1="${120 + Math.cos(a) * r1}" y1="${120 + Math.sin(a) * r1}" x2="${120 + Math.cos(a) * 114}" y2="${120 + Math.sin(a) * 114}"/>`;
  }).join('');
  const grid = `<g fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="120" cy="120" r="116" stroke-opacity=".7"/><circle cx="120" cy="120" r="40" stroke-opacity=".5"/>${ticks}<path d="M120 20 V100 M120 140 V220 M20 120 H100 M140 120 H220" stroke-opacity=".75"/></g><circle cx="120" cy="120" r="2" fill="currentColor"/>`;
  return [gone(h('div.wd-eye', { attrs: { 'aria-hidden': 'true' } })), gone(svgEl('wd-reticle', 240, grid))];
}

/**
 * Шаг без ночи (RT.4, вариант A «Строки обмена», выбор Дениса 22.10.2026, витрина
 * d8-route-wonders): Комета — 1 из 3 обменов «отдай → получи», Телескоп — 1 из 3 улучшений.
 * Строки одной высоты: знак обмена на игровых элементах и две строки текстом (что происходит, цена глаголом), ключевые слова с подсказкой; ничего не выбрано заранее,
 * «Мимо» — честная вторая кнопка. Вход — Комета пролетает по небу или наводится линза.
 */
export function showWonder(app: App, run: RunState, choice: Wonder, handlers: WonderHandlers): ModalHandle {
  const comet = choice.kind === 'comet';
  [CARD_W, SIGIL, CHART] = SIZES();
  const rows = choice.options.map((o) => (comet ? cometRow(run, o as CometTrade) : scopeRow(run, o as ScopeUpgrade)));
  let sel = -1;
  let busy = false;
  const label = h('span', null, t(comet ? 'wonder.chooseTrade' : 'wonder.chooseUpgrade'));
  const take = button(label, () => void commit(false), { disabled: true, className: 'wd-take' });
  const list = h('div.wd-rows');
  const els = rows.map((r, i) => {
    const el = h('button.wd-row', { type: 'button', attrs: { 'aria-pressed': 'false' }, onclick: (e: Event) => { if (!(e.target as HTMLElement).closest('.kw')) pick(i); } }, [
      h('div.wd-flow', { attrs: { 'aria-hidden': 'true' } }, [h('div.wd-items', null, r.give), h('span.wd-to'), h('div.wd-items', null, r.get)]),
      h('div.wd-text', null, [h('b.wd-gain', null, kwText(r.gain)), h('span.wd-cost', null, kwText(r.cost))]),
    ]);
    // Телескоп дольше наводится: строки проявляются, когда окуляр раскрылся
    el.style.animationDelay = `${(comet ? 0.38 : 0.7) + i * 0.09}s`;
    list.append(el);
    return el;
  });

  function pick(i: number): void {
    if (busy || sel === i) return;
    sel = i;
    list.classList.add('has-sel');
    els.forEach((el, j) => {
      el.classList.toggle('sel', i === j);
      el.setAttribute('aria-pressed', String(i === j));
    });
    take.disabled = false;
    label.textContent = t(comet ? 'wonder.trade' : 'wonder.take');
  }

  async function commit(skip: boolean): Promise<void> {
    if (busy || (!skip && sel < 0)) return;
    busy = true;
    if (!skip && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      app.svc.audio.coin();
      await els[sel]!.animate([{ boxShadow: 'inset 0 0 0 1.5px #ffe6a8, 0 0 0 0 rgb(255 230 168 / 0.8)' }, { boxShadow: 'inset 0 0 0 1.5px #ffe6a8, 0 0 0 16px rgb(255 230 168 / 0)' }], { duration: 480, easing: 'ease-out' }).finished.catch(() => undefined);
    }
    closeKeyword();
    scene.close();
    if (skip) handlers.skip();
    else handlers.take(sel);
  }

  app.svc.audio.ignite(1);
  const scene = sceneWindow({
    className: `wonder-scene ${comet ? 'is-comet' : 'is-scope'}`,
    label: t(comet ? 'route.comet' : 'route.telescope'),
    mid: [
      ...intro(comet),
      emblem(comet),
      sceneRibbon(t(comet ? 'route.comet' : 'route.telescope'), t(comet ? 'wonder.cometSub' : 'wonder.scopeSub')),
      h('p.wd-lead', null, t(comet ? 'wonder.cometLead' : 'wonder.scopeLead')),
      list,
    ],
    acts: [take, button(t('wonder.pass'), () => void commit(true), { variant: 'secondary' }), h('p.wd-note', null, t('wonder.then'))],
  });
  return scene;
}
