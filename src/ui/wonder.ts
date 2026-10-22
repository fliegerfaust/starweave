import { chartIcon, omenSigil } from '@/art/sigil';
import type { Choice } from '@/core/choices';
import { MAX_RANK, MIN_RANK, type Card, type ComboId, type RunState } from '@/core/types';
import type { CometTrade, ScopeUpgrade } from '@/core/wonders';
import type { App } from '@/game/app';
import { named, t } from '@/i18n';
import { canvasImg, dpr, h } from './dom';
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

/** На ПК элементы крупнее — рисуются в своём размере, растр не растягивается. */
const big = () => matchMedia('(min-width: 900px) and (min-height: 561px)').matches;
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
      return { give: [item.gold(tr.gold, true)], get: [item.omen(tr.omen)], ...w('goldForOmen', { gold: tr.gold, omen: named('omen', tr.omen).name }) };
    case 'cardForGlyph': {
      const give = card(tr.give);
      const target = card(tr.target);
      return { give: [item.gone(give)], get: [item.card({ ...target, glyph: tr.glyph })], ...w('cardForGlyph', { give: cardName(give), target: cardName(target), glyph: t(`glyphWith.${tr.glyph}`) }) };
    }
    case 'omenForGold': {
      const id = omenOf(tr.uid);
      return { give: [item.omen(id)], get: [item.gold(tr.gold)], ...w('omenForGold', { omen: named('omen', id).name, gold: tr.gold }) };
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
      return { give: [item.omen(id)], get: [item.omen(tr.omen)], ...w('omenForOmen', { a: named('omen', id).name, b: named('omen', tr.omen).name }) };
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
  if (u.u === 'glyph') return { give: [item.card(c)], get: [item.card({ ...c, glyph: u.glyph })], ...lines('wonder.scope.glyph', { card: cardName(c), glyph: t(`glyphWith.${u.glyph}`), desc: t(`glyphDesc.${u.glyph}`) }) };
  return { give: [item.card(c)], get: [item.gone(c)], ...lines('wonder.scope.banish', { card: cardName(c), n: run.deck.length - 1 }) };
}

/**
 * Шаг без ночи (RT.4, вариант A «Строки обмена», выбор Дениса 22.10.2026, витрина
 * d8-route-wonders): Комета — 1 из 3 обменов «отдай → получи», Телескоп — 1 из 3 улучшений.
 * Строки одной высоты: знак обмена на игровых элементах и две строки текстом (что получаешь, за что); ничего не выбрано заранее,
 * «Мимо» — честная вторая кнопка. Вход — Комета пролетает по небу или наводится линза.
 */
export function showWonder(app: App, run: RunState, choice: Wonder, handlers: WonderHandlers): ModalHandle {
  const comet = choice.kind === 'comet';
  [CARD_W, SIGIL, CHART] = big() ? [44, 50, 46] : [34, 38, 36];
  const rows = choice.options.map((o) => (comet ? cometRow(run, o as CometTrade) : scopeRow(run, o as ScopeUpgrade)));
  let sel = -1;
  let busy = false;
  const label = h('span', null, t(comet ? 'wonder.chooseTrade' : 'wonder.chooseUpgrade'));
  const take = button(label, () => void commit(false), { disabled: true, className: 'wd-take' });
  const list = h('div.wd-rows');
  const els = rows.map((r, i) => {
    const el = h('button.wd-row', { type: 'button', attrs: { 'aria-pressed': 'false' }, onclick: () => pick(i) }, [
      h('div.wd-flow', { attrs: { 'aria-hidden': 'true' } }, [h('div.wd-items', null, r.give), h('span.wd-to'), h('div.wd-items', null, r.get)]),
      h('div.wd-text', null, [h('b.wd-gain', null, r.gain), h('span.wd-cost', null, r.cost)]),
    ]);
    el.style.animationDelay = `${0.38 + i * 0.09}s`;
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
    scene.close();
    if (skip) handlers.skip();
    else handlers.take(sel);
  }

  app.svc.audio.ignite(1);
  const scene = sceneWindow({
    className: `wonder-scene ${comet ? 'is-comet' : 'is-scope'}`,
    label: t(comet ? 'route.comet' : 'route.telescope'),
    mid: [
      h(`div.wd-intro${comet ? '.streak' : '.lens'}`, { attrs: { 'aria-hidden': 'true' } }),
      sceneRibbon(t(comet ? 'route.comet' : 'route.telescope'), t(comet ? 'wonder.cometSub' : 'wonder.scopeSub')),
      list,
    ],
    acts: [take, button(t('wonder.pass'), () => void commit(true), { variant: 'secondary' }), h('p.wd-note', null, t('wonder.then'))],
  });
  return scene;
}
