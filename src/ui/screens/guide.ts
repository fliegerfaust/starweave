import { bossSigil, chartIcon, omenSigil, ritualIcon } from '@/art/sigil';
import { COMBO_EXAMPLES, comboBase } from '@/core/content/combos';
import { COMBO_IDS, GLYPHS, type Card, type ComboId, type Glyph, type Suit } from '@/core/types';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';
import { dict, format, named, t } from '@/i18n';
import { track } from '@/analytics';
import { canvasImg, dpr, h } from '../dom';
import { modal } from '../widgets';
import { cardThumb } from './common';

/*
 * «Живая доска» (RD.7, выбор Дениса): сверху — небо 4×4 или сцена термина, ниже — список.
 * Касание строки меняет доску: созвездие выкладывает свой пример и проигрывает подсчёт,
 * шаг ночи показывает себя на доске (шаги идут сами, пока игрока не тронули), Знамения
 * срабатывают по очереди, глиф подсвечен в линии с числом. Объясняет действием, а не
 * абзацами. На телефоне доска закреплена, листается список; на ПК — доска слева.
 */

export type GuideTab = 'combos' | 'night' | 'shop' | 'glyphs';

export interface GuideOptions {
  /** id раздела (например, `glyph-echo`, `cross`, `omens`): вкладка и строка подберутся сами. */
  focus?: string;
  tab?: GuideTab;
  /** Уровни созвездий текущего забега. */
  levels?: Record<ComboId, number>;
  /** Коллекция игрока: «Собрано N из 10» и отметки. */
  found?: readonly ComboId[];
  /** Нижним листом поверх ночи: доска игры остаётся видна. */
  sheet?: boolean;
}

const TABS: GuideTab[] = ['combos', 'night', 'shop', 'glyphs'];
const STEP_IDS = ['place', 'line', 'score', 'cross', 'burn', 'eclipse'] as const;
const SHOP_IDS = ['omens', 'order', 'charts', 'rituals', 'gold'] as const;
/** Старые id разделов (фокус из подсказок ночи и обучения) → шаг ночи. */
const STEP_OF: Record<string, number> = { line: 1, formula: 2, scoring: 2, cross: 3, burn: 4, eclipse: 5 };
const GLYPH_CARD: Record<Glyph, [number, Suit]> = { gilded: [7, 'sun'], blazing: [8, 'moon'], radiant: [9, 'star'], echo: [7, 'comet'], glass: [8, 'sun'], prism: [9, 'moon'] };
const PAIR: [number, Suit][] = [[3, 'sun'], [3, 'moon'], [7, 'star'], [5, 'comet']];

let fakeId = -9000;
const CELL = 34;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
const thumb = (rank: number, suit: Suit, w = CELL, glyph?: Glyph) => cardThumb({ id: fakeId--, rank, suit, ...(glyph ? { glyph } : {}) } as Card, w);

/** Число цветом формулы: свет, множитель, итог, золото. */
const chip = (cls: 'l' | 'm' | 't' | 'g' | 'w', text: string) => h(`b.gb-chip.${cls}`, null, text);
const chips = (...parts: (HTMLElement | string)[]) => h('span.gb-chips', null, parts.map((p) => (typeof p === 'string' ? h('span', null, p) : p)));
const coin = () => h('span.coin', { attrs: { 'aria-hidden': 'true' } });

/** Небо 4×4: ряд линии — индексы 4–7. */
function sky(cards: Record<number, [number, Suit]>, opts: { line?: boolean; drop?: boolean; glow?: boolean; cross?: number; fire?: number } = {}): HTMLElement {
  const grid = h(`div.gb-sky${opts.glow ? '.glow' : ''}`, { attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < 16; i++) {
    const c = cards[i];
    const inLine = opts.line && i >= 4 && i < 8;
    const cell = h(`i${inLine ? '.r' : ''}${opts.drop && inLine && c ? '.in' : ''}${opts.cross === i ? '.x' : ''}${opts.fire === i ? '.fire' : ''}`);
    if (inLine) cell.style.setProperty('--d', `${(i - 4) * 0.12}s`);
    if (c) cell.append(thumb(c[0], c[1]));
    grid.append(cell);
  }
  return grid;
}

export function showGuide(opts: GuideOptions = {}): void {
  const focus = opts.focus;
  let tab: GuideTab = opts.tab ?? 'combos';
  let combo: ComboId = 'pair';
  let step = 0;
  let auto = true;
  let shopSel: (typeof SHOP_IDS)[number] = 'omens';
  let glyph: Glyph = 'gilded';
  if (focus) {
    if (focus.startsWith('glyph-')) { tab = 'glyphs'; glyph = focus.slice(6) as Glyph; }
    else if ((SHOP_IDS as readonly string[]).includes(focus)) { tab = 'shop'; shopSel = focus as typeof shopSel; }
    else if (focus in STEP_OF) { tab = 'night'; step = STEP_OF[focus]!; auto = false; }
    else if ((COMBO_IDS as readonly string[]).includes(focus)) { tab = 'combos'; combo = focus as ComboId; }
  }
  track('guide_open', { focus: focus ?? tab });
  const g = dict().guide;
  const levelOf = (id: ComboId) => opts.levels?.[id] ?? 1;
  let timers: number[] = [];
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => m.el.isConnected && fn(), ms));

  const tabsBar = h('nav.gb-tabs', { attrs: { role: 'tablist', 'aria-label': g.title } });
  const body = h('div.gb');

  // ─── Созвездия ──────────────────────────────────────────────────────────
  const comboBoard = (): [HTMLElement, HTMLElement[]] => {
    const ex = COMBO_EXAMPLES[combo];
    const lvl = levelOf(combo);
    const base = comboBase(combo, lvl);
    const ranks = ex.map(([r]) => r);
    const light = base.light + ranks.reduce((a, b) => a + b, 0);
    const cards: Record<number, [number, Suit]> = { 0: [2, 'moon'], 13: [9, 'comet'] };
    ex.forEach((c, i) => (cards[4 + i] = c));
    const grid = sky(cards, { line: true, drop: !reduced() });
    const lightChip = chip('l', String(reduced() ? light : base.light));
    const tail = [h('span', null, '×'), chip('m', String(base.mult)), h('span', null, '='), chip('t', String(light * base.mult))];
    const sum = h('span.gb-chips', null, [lightChip, ...tail]);
    if (!reduced()) {
      // Подсчёт на доске: линия вспыхивает, свет набирается рангами, потом × и итог
      tail.forEach((e) => e.classList.add('wait'));
      let acc = base.light;
      later(() => grid.classList.add('glow'), 520);
      ranks.forEach((r, i) => later(() => { acc += r; lightChip.textContent = String(acc); }, 700 + i * 220));
      tail.forEach((e, i) => later(() => e.classList.remove('wait'), 700 + 4 * 220 + 120 + i * 90));
    } else grid.classList.add('glow');
    return [grid, [
      h('h3', null, [t(`combo.${combo}`), lvl > 1 ? h('span.gb-lv', null, t('combos.level', { n: lvl })) : null]),
      h('p', null, dict().comboDesc[combo]),
      h('span.gb-adds', null, format(g.fromRanks, { list: ranks.map((r) => `+${r}`).join(' ') })),
      sum,
    ]];
  };
  const comboList = () => {
    const found = opts.found;
    const list = h('div.gb-list');
    for (const id of COMBO_IDS) {
      const lvl = levelOf(id);
      const b = comboBase(id, lvl);
      const got = !!found && id !== 'scatter' && found.includes(id);
      const miss = !!found && id !== 'scatter' && !got;
      list.append(row(id === combo, miss, [
        h('b', null, [t(`combo.${id}`), got ? h('span.gb-ok', { attrs: { 'aria-label': '✓' } }, '✓') : null, lvl > 1 ? h('span.gb-lv', null, t('combos.level', { n: lvl })) : null]),
        h('small', null, dict().comboDesc[id]),
      ], h('span.gb-base', null, [h('span.light-text', null, String(b.light)), h('span.gb-x', null, '×'), h('span.mult-text', null, String(b.mult))]), () => { combo = id; render(); }));
    }
    return [section(g.allCombos, found ? t('discovery.collected', { n: found.length, total: COLLECTIBLE_COMBOS.length }) : null), list];
  };

  // ─── Ночь ───────────────────────────────────────────────────────────────
  const nightBoard = (): [HTMLElement, HTMLElement[]] => {
    const line: Record<number, [number, Suit]> = { 4: [3, 'sun'], 5: [3, 'moon'], 6: [7, 'star'], 7: [5, 'comet'] };
    const id = STEP_IDS[step]!;
    const grid =
      id === 'place' ? sky({ 1: [2, 'moon'], 4: [3, 'sun'], 5: [3, 'moon'], 6: [7, 'star'] }, { line: true, drop: !reduced() })
      : id === 'line' ? sky({ ...line, 1: [2, 'moon'] }, { line: true, glow: true })
      : id === 'score' ? sky(line, { line: true, glow: true })
      : id === 'cross' ? sky({ 0: [4, 'sun'], 1: [9, 'moon'], 3: [2, 'star'], 6: [5, 'comet'], 10: [7, 'sun'], 14: [6, 'moon'] }, { cross: 2 })
      : id === 'burn' ? sky({ 9: [1, 'comet'] }, { fire: 9 })
      : sky({});
    const [title, text] = g.steps[step]!;
    const extra = id === 'score' ? chips(chip('l', '10'), '+18 =', chip('l', '28'), '×', chip('m', '2'), '=', chip('t', '56'))
      : id === 'eclipse' ? canvasImg(bossSigil('eclipse-moon', 48, dpr()), 48) : null;
    return [grid, [h('h3', null, `${step + 1}. ${title}`), h('p', null, text), extra].filter((x): x is HTMLElement => !!x)];
  };
  const nightList = () => {
    const list = h('div.gb-list');
    g.steps.forEach(([title, text], i) => list.append(row(i === step, false, [h('b', null, `${i + 1}. ${title}`), h('small', null, text)], null, () => { step = i; auto = false; render(); })));
    const goal = h('p.gb-goal');
    goal.innerHTML = g.goal;
    return [section(g.nightHead, auto ? g.auto : format(g.stepOf, { n: step + 1, total: g.steps.length })), list, goal];
  };

  // ─── Обсерватория ───────────────────────────────────────────────────────
  const s = dpr();
  const sigil = (id: string, size = 34) => canvasImg(omenSigil(id, size, s), size);
  /** Знамение в слоте вспыхивает в свою очередь. */
  const fired = (art: HTMLElement, delay: number) => {
    const slot = h('span.fire', null, art);
    slot.style.setProperty('--d', `${delay}s`);
    return slot;
  };
  const shopBoard = (): [HTMLElement, HTMLElement[]] => {
    const row4 = () => h('span.gb-row4', null, PAIR.map(([r, su]) => thumb(r, su)));
    const [title, text] = g.shopItems[shopSel]!;
    const a = named('omen', 'stardust').name;
    const b = named('omen', 'glassCannon').name;
    let vis: HTMLElement;
    let tally: (HTMLElement | null)[];
    switch (shopSel) {
      case 'omens': {
        const slots = h('span.gb-slots', null, [
          fired(sigil('stardust'), 0.5),
          fired(sigil('glassCannon'), 1.1),
          h('span.empty'), h('span.empty'), h('span.empty'),
        ]);
        vis = h('div.gb-stage', null, [row4(), slots]);
        tally = [chips(chip('l', '28'), '×', chip('m', '2')), h('span.gb-adds', null, format(g.fired, { a, b })), chips(chip('l', '28'), '×', chip('m', '18'), '=', chip('t', '504'))];
        break;
      }
      case 'order':
        vis = h('div.gb-stage.gb-order', null, [
          h('span.good', null, [sigil('stardust', 26), h('span.arr', null, '→'), sigil('glassCannon', 26), h('b', null, '(2 + 4) × 3 = 18 ✓')]),
          h('span.bad', null, [sigil('glassCannon', 26), h('span.arr', null, '→'), sigil('stardust', 26), h('span', null, '2 × 3 + 4 = 10')]),
        ]);
        tally = [chips(chip('l', '28'), '×', chip('m', '18'), '=', chip('t', '504')), h('span.gb-adds.dim', null, g.wrongOrder)];
        break;
      case 'charts': {
        const lv1 = comboBase('pair', 1);
        const lv2 = comboBase('pair', 2);
        vis = h('div.gb-stage', null, [canvasImg(chartIcon('pair', 64, s), 64, 64, 'gb-big'), row4()]);
        tally = [h('span.gb-lvup', null, [h('span.light-text', null, String(lv1.light)), '×', h('span.mult-text', null, String(lv1.mult)), h('span.arr', null, '→'), h('span.light-text', null, String(lv2.light)), '×', h('span.mult-text', null, String(lv2.mult))]),
          h('span.gb-adds.gold', null, format(g.chartLevel, { combo: t('combo.pair') }))];
        break;
      }
      case 'rituals':
        vis = h('div.gb-stage', null, [canvasImg(ritualIcon('transmute-moon', 64, s), 64, 64, 'gb-big'), h('span.gb-flip', null, [h('span.a', null, thumb(3, 'sun', 46)), h('span.b', null, thumb(3, 'moon', 46))])]);
        tally = [h('span.gb-adds.dim', null, g.ritualNote)];
        break;
      default: {
        const rows: [string, string][] = [[g.goldRows[0]!, '+3'], [g.goldRows[1]!, '+2'], [g.goldRows[2]!, '+2'], [g.goldRows[3]!, '+7']];
        vis = h('div.gb-stage.gb-coins', null, rows.map(([label, v], i) => h(`div${i === 3 ? '.sum' : ''}`, null, [h('span', null, label), h('b', null, [v, ' ', coin()])])));
        tally = [];
      }
    }
    return [vis, [h('h3', null, title), h('p', null, text), ...tally].filter((x): x is HTMLElement => !!x)];
  };
  const shopList = () => {
    const icons: Record<string, () => HTMLElement> = {
      omens: () => sigil('stardust', 30), order: () => sigil('glassCannon', 30), charts: () => canvasImg(chartIcon('pair', 30, s), 30),
      rituals: () => canvasImg(ritualIcon('transmute-moon', 30, s), 30), gold: () => h('span.gb-coin-ic', null, coin()),
    };
    const list = h('div.gb-list');
    for (const id of SHOP_IDS) {
      const [title, text] = g.shopItems[id]!;
      list.append(row(id === shopSel, false, [h('b', null, title), h('small', null, text)], null, () => { shopSel = id; render(); }, icons[id]!()));
    }
    return [section(g.tabs.shop!, g.shopSub), list];
  };

  // ─── Глифы ──────────────────────────────────────────────────────────────
  const glyphBoard = (): [HTMLElement, HTMLElement[]] => {
    const [r, su] = GLYPH_CARD[glyph];
    const line = h('span.gb-row4', null, [thumb(3, 'sun'), h('span.hot', null, thumb(r, su, CELL, glyph)), thumb(5, 'star'), thumb(6, 'comet')]);
    const w = g.glyphTally;
    const tally: Record<Glyph, HTMLElement> = {
      gilded: chips(h('b.gb-chip.g', null, ['+2 ', coin()]), w.atFlare),
      blazing: chips(chip('m', '+4'), w.toMult),
      radiant: chips(chip('l', '+30'), w.light),
      echo: chips(chip('l', `+${r}`), chip('l', `+${r}`), w.twice),
      glass: chips(chip('m', '×2'), w.mult, chip('w', '1/4'), w.breaks),
      prism: chips(chip('l', '☀ ☾ ✦ ☄'), w.anySuit),
    };
    return [h('div.gb-stage', null, line), [h('h3', null, t(`glyph.${glyph}`)), h('p', null, dict().glyphDesc[glyph]), tally[glyph]]];
  };
  const glyphList = () => {
    const list = h('div.gb-list');
    for (const gl of GLYPHS) {
      const [r, su] = GLYPH_CARD[gl];
      list.append(row(gl === glyph, false, [h('b', null, t(`glyph.${gl}`)), h('small', null, dict().glyphDesc[gl])], null, () => { glyph = gl; render(); }, h('span.gb-card-ic', null, thumb(r, su, 22, gl))));
    }
    return [section(g.tabs.glyphs!, g.glyphSub), list];
  };

  /** Строка списка: касание меняет доску. */
  function row(on: boolean, miss: boolean, text: HTMLElement[], right: HTMLElement | null, onPick: () => void, icon?: HTMLElement): HTMLElement {
    const b = h(`button.gb-row${on ? '.on' : ''}${miss ? '.miss' : ''}${icon ? '.with-ic' : ''}`, { type: 'button', attrs: { 'aria-pressed': String(on) } }, [
      icon ?? null, h('span.gb-text', null, text), right,
    ]);
    b.addEventListener('click', (e) => {
      if (b.classList.contains('on')) return;
      onPick();
      // С клавиатуры строка пересоздана — возвращаем на неё фокус
      if (e.detail === 0) body.querySelector<HTMLElement>('.gb-row.on')?.focus({ preventScroll: true });
    });
    return b;
  }
  const section = (title: string, sub: string | null) => h('h3.gb-section', null, [title, sub ? h('small', null, sub) : null]);

  let shownTab: GuideTab | null = null;
  function render(): void {
    timers.forEach(clearTimeout);
    timers = [];
    const keep = shownTab === tab ? body.querySelector('.gb-scroll')?.scrollTop ?? 0 : 0;
    tabsBar.querySelectorAll<HTMLElement>('.gb-tab').forEach((el) => {
      const on = el.dataset.tab === tab;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    });
    const [vis, tally] = tab === 'combos' ? comboBoard() : tab === 'night' ? nightBoard() : tab === 'shop' ? shopBoard() : glyphBoard();
    const below = tab === 'combos' ? comboList() : tab === 'night' ? nightList() : tab === 'shop' ? shopList() : glyphList();
    // Широкая сцена (Обсерватория) — подпись под ней
    const board = h(`div.gb-board${tab === 'shop' ? '.stack' : ''}`, null, [vis, h('div.gb-tally', { attrs: { 'aria-live': 'polite' } }, tally)]);
    body.replaceChildren(h('div.gb-pin', null, board), h('div.gb-scroll', null, below));
    body.querySelector('.gb-scroll')!.scrollTop = keep;
    shownTab = tab;
    // Шаги ночи идут сами, пока игрок не выбрал шаг
    if (tab === 'night' && auto && !reduced()) later(() => { step = (step + 1) % g.steps.length; render(); }, 3200);
  }

  TABS.forEach((id, i) => {
    const b = h('button.gb-tab', { type: 'button', dataset: { tab: id }, attrs: { role: 'tab' } }, g.tabs[id]!);
    b.addEventListener('click', () => {
      if (tab === id) return;
      tab = id;
      render();
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      tab = TABS[(i + d + TABS.length) % TABS.length]!;
      render();
      tabsBar.querySelector<HTMLElement>('.gb-tab.on')?.focus();
    });
    tabsBar.append(b);
  });
  const m = modal(body, { title: g.title, className: 'board-modal guide-modal', sheet: opts.sheet, headExtra: tabsBar, onClose: () => timers.forEach(clearTimeout) });
  render();
  // Фокус на строке из подсказки — она видна в списке
  if (focus) requestAnimationFrame(() => body.querySelector('.gb-row.on')?.scrollIntoView({ block: 'nearest' }));
}
