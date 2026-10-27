import { bossSigil, chartIcon, comboScheme, omenSigil, ritualIcon } from '@/art/sigil';
import { COMBO_EXAMPLES, comboBase } from '@/core/content/combos';
import { BODY_IDS, COMBO_IDS, GLYPHS, type BodyId, type Card, type ComboId, type Glyph, type Suit } from '@/core/types';
import { BODY_UNLOCKS } from '@/core/content/pools';
import { COLLECTIBLE_COMBOS, isUnlocked, type Profile } from '@/meta/profile';
import { collectionTally } from '@/meta/collection';
import { BOSS_LIST } from '@/core/content/bosses';
import { MYTHS, MYTHS_UNLOCK } from '@/core/content/myths';
import { OMEN_LIST } from '@/core/content/omens';
import { RESONANCE_UNLOCK } from '@/core/content/resonance';
import { SKY_LIST } from '@/core/content/skies';
import { TROPHY_UNLOCK } from '@/core/content/trophies';
import { dict, format, getLang, named, num, t } from '@/i18n';
import { track } from '@/analytics';
import { suitPath } from '@/art/glyphs';
import { SUIT_COLORS } from '@/art/palette';
import { canvasImg, dpr, h, type Child } from '../dom';
import { icon } from '../icons';
import { modal } from '../widgets';
import { rich } from '../rich';
import { cardThumb } from './common';
import { mythFigure } from '../myth-figure';

/*
 * «Живая доска» (RD.7, выбор Дениса): сверху — небо 4×4 или сцена термина, ниже — список.
 * Касание строки меняет доску: созвездие выкладывает свой пример и проигрывает подсчёт,
 * шаг ночи показывает себя на доске (шаги идут сами, пока игрока не тронули), Знамения
 * срабатывают по очереди, глиф подсвечен в линии с числом. Объясняет действием, а не
 * абзацами. На телефоне доска закреплена, листается список; на ПК — доска слева.
 */

/** Знамения лавки и легендарные Резонанса — в Коллекции считаются отдельно. */
const REGULAR = OMEN_LIST.filter((x) => !x.pair);
const LEGENDS = OMEN_LIST.filter((x) => x.pair);

export type GuideTab = 'combos' | 'night' | 'shop' | 'glyphs' | 'collection';

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
  /** Профиль игрока: с ним во Справочнике есть вкладка «Коллекция» (бывший Кодекс). */
  profile?: Profile;
  /** Окно закрыли (баннер ночи ждёт этого, чтобы досмотреть очередь). */
  onClose?: () => void;
}

const TABS: GuideTab[] = ['combos', 'night', 'shop', 'glyphs', 'collection'];
const STEP_IDS = ['place', 'line', 'score', 'cross', 'burn', 'eclipse'] as const;
const SHOP_IDS = ['omens', 'order', 'charts', 'rituals', 'gold'] as const;
/** Старые id разделов (фокус из подсказок ночи и обучения) → шаг ночи. */
const STEP_OF: Record<string, number> = { line: 1, formula: 2, scoring: 2, cross: 3, burn: 4, eclipse: 5 };
const GLYPH_CARD: Record<Glyph, [number, Suit]> = { gilded: [7, 'sun'], blazing: [8, 'moon'], radiant: [9, 'star'], echo: [7, 'comet'], glass: [8, 'sun'], prism: [9, 'moon'] };
const PAIR: [number, Suit][] = [[3, 'sun'], [3, 'moon'], [7, 'star'], [5, 'comet']];

let fakeId = -9000;
const CELL = 34;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
const thumb = (rank: number, suit: Suit, w = CELL, glyph?: Glyph, body?: BodyId) => cardThumb({ id: fakeId--, rank, suit, ...(glyph ? { glyph } : {}), ...(body ? { body } : {}) } as Card, w);

/**
 * Небесные тела на доске (GF.5): линия ряда, карта над ней (сосед Метеора, Пульсар у линии),
 * роль каждой карты в показе. `t` — тело, `x` — гаснет со вспышкой, `o` — выбита Метеором.
 */
type BodyCard = [number, Suit, ('t' | 'x' | 'o')?];
const BODY_DEMO: Record<BodyId, { line: BodyCard[]; above?: [number, BodyCard] }> = {
  polaris: { line: [[2, 'moon', 'x'], [3, 'star', 'x'], [4, 'comet', 'x'], [5, 'sun', 't']] },
  meteor: { line: [[3, 'sun', 'x'], [3, 'moon', 'x'], [9, 'star', 'x'], [6, 'comet', 't']], above: [3, [1, 'star', 'o']] },
  pulsar: { line: [[2, 'sun', 'x'], [6, 'sun', 'x'], [4, 'sun', 'x'], [8, 'sun', 'x']], above: [1, [4, 'star', 't']] },
  twin: { line: [[4, 'sun', 'x'], [4, 'moon', 't'], [5, 'star', 'x'], [9, 'comet', 'x']] },
  nebula: { line: [[7, 'sun', 'x'], [7, 'moon', 'x'], [7, 'comet', 'x'], [7, 'star', 't']] },
  blackhole: { line: [[6, 'moon', 'x'], [6, 'sun', 'x'], [2, 'star', 'x'], [3, 'comet', 't']] },
};

/** Четыре масти рисунком — вместо символов ☀ ☾ ✦ ☄ (у них нет нужного вида в шрифтах). */
function suitMarks(): HTMLCanvasElement {
  const r = dpr();
  const c = document.createElement('canvas');
  c.width = 72 * r;
  c.height = 16 * r;
  const ctx = c.getContext('2d')!;
  ctx.scale(r, r);
  (['sun', 'moon', 'star', 'comet'] as Suit[]).forEach((suit, i) => {
    suitPath(ctx, suit, 9 + i * 18, 8, 6.5);
    ctx.fillStyle = SUIT_COLORS[suit].main;
    ctx.fill();
  });
  return canvasImg(c, 72, 16);
}

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

/** Раздел Коллекции в фокусе: `collection`, `myths`, `legends`, находка `myth-…`, `omen-…`, `boss-…`, `legend-…`. */
const isCollectionFocus = (focus?: string) => !!focus && (['collection', 'myths', 'legends'].includes(focus) || /^(myth|omen|boss|legend)-/.test(focus));

/**
 * Справочник — правила: созвездия, ночь, Обсерватория, карты. Коллекция с CL.2 — своё окно:
 * старые вызовы с вкладкой или фокусом Коллекции открывают его.
 */
export function showGuide(opts: GuideOptions = {}): void {
  if (opts.profile && (opts.tab === 'collection' || isCollectionFocus(opts.focus))) return showCollection(opts.profile, opts.focus);
  openBoard(opts, false);
}

/**
 * Коллекция (CL.2): то же окно «доска + список», без вкладок правил. Наверху — итоги
 * игрока, ниже — мифы, Знамения, легендарные, Затмения и небеса.
 */
export function showCollection(profile: Profile, focus?: string, onClose?: () => void): void {
  openBoard({ profile, found: profile.combosFound, tab: 'collection', ...(focus ? { focus } : {}), ...(onClose ? { onClose } : {}) }, true);
}

function openBoard(opts: GuideOptions, only: boolean): void {
  const focus = opts.focus;
  let tab: GuideTab = opts.tab ?? 'combos';
  let combo: ComboId = 'pair';
  let step = 0;
  let auto = true;
  let shopSel: (typeof SHOP_IDS)[number] = 'omens';
  let glyph: Glyph = 'gilded';
  // Тела, открытые игроку (ступень 3): тогда вкладка «Глифы» становится «Карты» — глифы и
  // тела двумя разделами (шестая вкладка не помещается на телефоне); без тел новичок их не видит
  const openBodies = opts.profile ? BODY_IDS.filter((b) => isUnlocked(BODY_UNLOCKS[b], opts.profile!)) : [];
  let bodyId: BodyId = openBodies[0] ?? 'polaris';
  /** На вкладке «Карты» доска показывает тело, а не глиф. */
  let showBody = false;
  if (focus) {
    if (focus.startsWith('glyph-')) { tab = 'glyphs'; glyph = focus.slice(6) as Glyph; }
    else if (focus.startsWith('body-') && openBodies.length) { tab = 'glyphs'; bodyId = focus.slice(5) as BodyId; showBody = true; }
    else if ((SHOP_IDS as readonly string[]).includes(focus)) { tab = 'shop'; shopSel = focus as typeof shopSel; }
    else if (focus in STEP_OF) { tab = 'night'; step = STEP_OF[focus]!; auto = false; }
    else if ((COMBO_IDS as readonly string[]).includes(focus)) { tab = 'combos'; combo = focus as ComboId; }
    else if (focus === 'collection' && opts.profile) tab = 'collection';
    else if (focus === 'myths' && opts.profile) tab = 'collection';
    else if (focus === 'legends' && opts.profile) tab = 'collection';
  }
  const tabs = only ? (['collection'] as GuideTab[]) : TABS.filter((x) => x !== 'collection');
  // Коллекция: выбранное Знамение, Затмение или миф — крупно на доске
  // Находка с главной (CL.1): `myth-lyra`, `omen-stardust`, `boss-fog`, `legend-noon`
  const findFocus = focus?.match(/^(myth|omen|boss|legend)-(.+)$/);
  if (findFocus && opts.profile) tab = 'collection';
  let pick: { kind: 'omen' | 'boss' | 'myth' | 'legend'; id: string } | null =
    findFocus && opts.profile ? { kind: findFocus[1] as 'omen' | 'boss' | 'myth' | 'legend', id: findFocus[2]! }
    : focus === 'myths' ? { kind: 'myth', id: MYTHS[0]!.id }
    : focus === 'legends' ? { kind: 'legend', id: (LEGENDS.find((x) => !opts.profile!.seenOmens.includes(x.id)) ?? LEGENDS[0]!).id }
    : null;
  track(only ? 'collection_open' : 'guide_open', { focus: focus ?? tab });
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
      h('p', null, rich(dict().comboDesc[combo])),
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
        h('b', null, [t(`combo.${id}`), got ? h('span.gb-ok', { attrs: { 'aria-label': t('combos.found') } }, icon('check')) : null, lvl > 1 ? h('span.gb-lv', null, t('combos.level', { n: lvl })) : null]),
        h('small', null, rich(dict().comboDesc[id])),
      ], h('span.gb-base', null, [h('span.light-text', null, String(b.light)), h('span.gb-x', null, '×'), h('span.mult-text', null, String(b.mult))]), () => { combo = id; render(); },
      // Схема созвездия: высота звезды — ранг, цвет — масть, дуги — что совпало
      h('span.gb-scheme', null, canvasImg(comboScheme(id, 52, dpr()), 52, Math.round((52 * 68) / 116)))));
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
    return [grid, [h('h3', null, `${step + 1}. ${title}`), h('p', null, rich(text)), extra].filter((x): x is HTMLElement => !!x)];
  };
  const nightList = () => {
    const list = h('div.gb-list');
    g.steps.forEach(([title, text], i) => list.append(row(i === step, false, [h('b', null, `${i + 1}. ${title}`), h('small', null, rich(text))], null, () => { step = i; auto = false; render(); })));
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
    // Эффект один раз — строкой с ключевыми словами (FX.9); плашки остаются только примером
    // там, где строка его не показывает: Эхо считает ранг дважды, Призма — любая масть
    const example: Partial<Record<Glyph, HTMLElement>> = {
      echo: chips(chip('l', `+${r}`), chip('l', `+${r}`), w.twice),
      prism: chips(h('b.gb-chip.l.gb-suits', null, suitMarks()), w.anySuit),
    };
    return [h('div.gb-stage', null, line), [h('h3', null, t(`glyph.${glyph}`)), h('p', null, rich(dict().glyphDesc[glyph])), ...[example[glyph]].filter((x): x is HTMLElement => !!x)]];
  };
  const glyphList = () => {
    const list = h('div.gb-list');
    for (const gl of GLYPHS) {
      const [r, su] = GLYPH_CARD[gl];
      list.append(row(!showBody && gl === glyph, false, [h('b', null, t(`glyph.${gl}`)), h('small', null, rich(dict().glyphDesc[gl]))], null, () => { glyph = gl; showBody = false; render(); }, h('span.gb-card-ic', null, thumb(r, su, 22, gl))));
    }
    return [section(g.tabs.glyphs!, g.glyphSub), list, ...(openBodies.length ? bodyList() : [])];
  };

  // ─── Небесные тела ──────────────────────────────────────────────────────
  const bodyCardOf = (b: BodyId): BodyCard => [BODY_DEMO[b].above?.[1], ...BODY_DEMO[b].line].find((c) => c?.[2] === 't')!;
  const bodyBoard = (): [HTMLElement, HTMLElement[]] => {
    const demo = BODY_DEMO[bodyId];
    const card = ([r, su, role]: BodyCard) => h(`span.gb-bc${role ? `.${role}` : ''}`, null, thumb(r, su, CELL, undefined, role === 't' ? bodyId : undefined));
    const top = h('span.gb-row4.gb-above', null, [0, 1, 2, 3].map((i) => (demo.above?.[0] === i ? card(demo.above[1]) : h('span.gb-bc.empty'))));
    const line = h('span.gb-row4', null, demo.line.map(card));
    const stage = h(`div.gb-stage.gb-bodies.b-${bodyId}${reduced() ? '.still' : ''}`, null, demo.above ? [top, line] : [line]);
    const w = g.bodyTally;
    const tally: Record<BodyId, HTMLElement> = {
      polaris: chips(chip('t', t('combo.straight')), w.polaris),
      meteor: chips(w.meteor),
      pulsar: chips(chip('m', '+2'), w.pulsar),
      twin: chips(chip('t', t('combo.twoPair')), w.twin),
      nebula: chips(chip('t', t('combo.quartet')), w.nebula),
      blackhole: chips(chip('t', t('combo.pair')), chip('m', '×2'), w.blackhole),
    };
    return [stage, [h('h3', null, t(`body.${bodyId}`)), h('p', null, rich(dict().bodyDesc[bodyId])), tally[bodyId]]];
  };
  const bodyList = () => {
    const list = h('div.gb-list');
    for (const b of BODY_IDS) {
      const open = openBodies.includes(b);
      const [r, su] = bodyCardOf(b);
      const unlock = BODY_UNLOCKS[b];
      const lockText = unlock.kind === 'eclipses' ? t('unlock.eclipses', { n: unlock.count }) : '';
      const ic = h(`span.gb-card-ic${open ? '' : '.locked'}`, null, thumb(r, su, 22, undefined, b));
      if (!open) {
        list.append(h('div.gb-row.miss.with-ic', null, [ic, h('span.gb-text', null, [h('b', null, t(`body.${b}`)), h('small', null, lockText)]), icon('lock')]));
        continue;
      }
      list.append(row(showBody && b === bodyId, false, [h('b', null, t(`body.${b}`)), h('small', null, rich(dict().bodyDesc[b]))], null, () => { bodyId = b; showBody = true; render(); }, ic));
    }
    return [section(g.bodies, g.bodiesSub), list];
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

  // ─── Коллекция (бывший Кодекс) ───────────────────────────────────────────
  const c = dict().codex;
  /** Знак на доске: в широком окне (ПК) крупнее — доске есть где. */
  const bigSize = () => (document.body.classList.contains('landscape') && matchMedia('(min-width: 900px) and (min-height: 561px)').matches ? 128 : 56);
  const collSigil = (kind: 'omen' | 'boss', id: string, size: number) => canvasImg(kind === 'omen' ? omenSigil(id, size, dpr()) : bossSigil(id, size, dpr()), size);
  /** Описание без «(сейчас +{x})» — вне забега текущего значения нет. */
  const effect = (text: string) => text.replace(/\s*\([^)]*\{x\}[^)]*\)/, '').replace('{x}', '…');
  const collectionBoard = (): [HTMLElement, Child[]] => {
    const p = opts.profile!;
    if (!pick) {
      const omen = REGULAR.find((x) => p.seenOmens.includes(x.id)) ?? REGULAR[0]!;
      pick = { kind: 'omen', id: omen.id };
    }
    if (pick.kind === 'myth') return mythBoard(pick.id);
    if (pick.kind === 'legend') return legendBoard(pick.id);
    const known = (pick.kind === 'omen' ? p.seenOmens : p.seenBosses).includes(pick.id);
    const big = collSigil(pick.kind, pick.id, bigSize());
    big.classList.add('gb-big');
    if (!known) big.classList.add('unknown');
    const info = named(pick.kind, pick.id);
    const kind = pick.kind === 'omen' ? OMEN_LIST.find((x) => x.id === pick!.id)?.kind ?? null : null;
    if (pick.kind === 'boss' && known && trophiesOpen()) return trophyBoard(pick.id, big);
    const tally = known
      ? [h('h3', null, info.name), h(`span.gb-kind${kind ? `.${kind}` : ''}`, null, kind ? c.kinds[kind] ?? '' : c.eclipse), h('p', null, rich(effect(info.desc)))]
      : [h('h3', null, pick.kind === 'omen' ? c.unknownOmenName : c.unknownBossName), h('span.gb-kind', null, c.notFound), h('p', null, pick.kind === 'omen' ? c.unknownOmen : c.unknownBoss)];
    return [h('div.gb-stage', null, big), tally];
  };
  // ─── Легендарные Резонанса (RS.3): видны со ступени «Резонанс» ──────────
  const resonanceOpen = () => isUnlocked(RESONANCE_UNLOCK, opts.profile!);
  const seenOmen = (id: string) => opts.profile!.seenOmens.includes(id);
  /** Пара на доске: половинки и легендарное; неувиденное — силуэтом. */
  const formula = (id: string, half: number, size: number) => {
    const [a, b] = LEGENDS.find((x) => x.id === id)!.pair!;
    const sig = (x: string, n: number) => {
      const el = collSigil('omen', x, n);
      if (!seenOmen(x)) el.classList.add('unknown');
      return el;
    };
    return [sig(a, half), h('span.gb-plus', null, '+'), sig(b, half), h('span.gb-plus', null, '='), sig(id, size)];
  };
  /** Найденное легендарное — имя, из чего слито и бонус; ненайденное — силуэт и подсказка, какую пару поставить рядом. */
  const legendBoard = (id: string): [HTMLElement, Child[]] => {
    const found = seenOmen(id);
    const [a, b] = LEGENDS.find((x) => x.id === id)!.pair!;
    const nameOf = (x: string) => (seenOmen(x) ? `[${named('omen', x).name}|omen.${x}]` : c.unknownHalf);
    // Легендарное крупно, у имени — из чего оно сливается
    const [ha, plus, hb, , big] = formula(id, 20, bigSize());
    big!.classList.add('gb-big');
    // Пара половинок — в строке вида, не отдельной строкой: доска не выше, чем у Знамения
    const kindRow = (label: HTMLElement) => h('div.gb-kindrow', null, [label, h('span.gb-formula', null, [ha!, plus!, hb!])]);
    const kind = OMEN_LIST.find((x) => x.id === id)!.kind;
    return [h('div.gb-stage', null, big!), found
      ? [h('h3', null, named('omen', id).name), kindRow(h(`span.gb-kind.${kind}`, null, `${c.legend} · ${c.kinds[kind] ?? ''}`)), h('p', null, rich(effect(named('omen', id).desc)))]
      : [h('h3', null, c.unknownLegend), kindRow(h('span.gb-kind', null, c.legend)), h('p', null, rich(format(c.unknownLegendDesc, { a: nameOf(a), b: nameOf(b) })))]];
  };
  const legendList = (): HTMLElement[] => {
    const el = h('div.gb-sigils.gb-legends');
    for (const x of LEGENDS) {
      const found = seenOmen(x.id);
      const on = pick?.kind === 'legend' && pick.id === x.id;
      const b = h(`button${found ? '' : '.unknown'}${on ? '.on' : ''}`, {
        type: 'button',
        attrs: { 'aria-pressed': String(on), 'aria-label': found ? named('omen', x.id).name : c.unknownLegend },
      }, collSigil('omen', x.id, 40));
      b.addEventListener('click', (e) => {
        if (on) return;
        pick = { kind: 'legend', id: x.id };
        render();
        if (e.detail === 0) body.querySelector<HTMLElement>('.gb-legends .on')?.focus({ preventScroll: true });
      });
      el.append(b);
    }
    const n = LEGENDS.filter((x) => seenOmen(x.id)).length;
    return [section(c.legends, format(c.foundN, { n, total: LEGENDS.length })), el];
  };
  // ─── Звёздный каталог (MY.4): виден со ступени «Мифы» ───────────────────
  const mythsOpen = () => isUnlocked(MYTHS_UNLOCK, opts.profile!);
  const mythFound = (id: string) => opts.profile!.mythsFound?.includes(id) ?? false;
  const mythName = (id: string) => (dict().myth as Record<string, string>)[id] ?? id;
  /** Найденный миф — рисунок золотом, имя, множитель и легенда; неизвестный — силуэт фигуры. */
  const mythBoard = (id: string): [HTMLElement, Child[]] => {
    const found = mythFound(id);
    const big = mythFigure(id, bigSize(), found);
    big.classList.add('gb-myth');
    const x = MYTHS.find((m) => m.id === id)!.x;
    return [h('div.gb-stage', null, big), found
      ? [h('h3', null, mythName(id)), h('span.gb-kind.gold', null, format(c.mythKind, { x })), h('p', null, (dict().mythDesc as Record<string, string>)[id] ?? '')]
      : [h('h3', null, c.unknownMyth), h('span.gb-kind', null, format(c.mythKind, { x })), h('p', null, c.unknownMythDesc)]];
  };
  const mythList = (): HTMLElement[] => {
    const el = h('div.gb-sigils.gb-myths');
    for (const m of MYTHS) {
      const found = mythFound(m.id);
      const on = pick?.kind === 'myth' && pick.id === m.id;
      const b = h(`button${found ? '' : '.unknown'}${on ? '.on' : ''}`, { type: 'button', attrs: { 'aria-pressed': String(on), 'aria-label': found ? mythName(m.id) : c.unknownMyth } }, mythFigure(m.id, 40, found));
      b.addEventListener('click', (e) => {
        if (on) return;
        pick = { kind: 'myth', id: m.id };
        render();
        if (e.detail === 0) body.querySelector<HTMLElement>('.gb-myths .on')?.focus({ preventScroll: true });
      });
      el.append(b);
    }
    const n = MYTHS.filter((m) => mythFound(m.id)).length;
    return [section(c.myths, format(c.foundN, { n, total: MYTHS.length })), el];
  };
  // ─── Трофеи Затмений (TR.4, вариант A4 Дениса): видны со ступени трофеев ──
  const trophiesOpen = () => isUnlocked(TROPHY_UNLOCK, opts.profile!);
  const tamedOf = (id: string) => opts.profile!.tamed?.[id] ?? 0;
  const tamedText = (n: number) => format(c.tamedN[new Intl.PluralRules(getLang()).select(n)] ?? c.tamedN.other!, { n });
  /**
   * Трофей главный: что взято и какой бонус даёт, сколько раз приручён. Затмение — строкой
   * ниже, тише: доска не выше, чем у Знамения. Знак один — Затмения; у приручённого он
   * золотой, как медаль трофея.
   */
  const trophyBoard = (id: string, big: HTMLElement): [HTMLElement, Child[]] => {
    const n = tamedOf(id);
    const tro = named('trophy', id);
    const boss = named('boss', id);
    big.classList.toggle('gold', n > 0);
    return [h('div.gb-stage', null, big), [
      h(`h3${n ? '' : '.wild'}`, null, tro.name),
      h(`span.gb-kind.gold${n ? '' : '.none'}`, null, [c.trophy, ' · ', n ? tamedText(n) : c.notTamed]),
      h('p', null, rich(tro.desc)),
      h('p.gb-ecl', null, [h('b', null, boss.name), h('span', null, [' · ', rich(effect(boss.desc))])]),
    ]];
  };
  const collectionList = (): HTMLElement[] => {
    const p = opts.profile!;
    const grid = (kind: 'omen' | 'boss') => {
      const list = kind === 'omen' ? REGULAR : BOSS_LIST;
      const seen = (kind === 'omen' ? p.seenOmens : p.seenBosses).filter((id) => list.some((x) => x.id === id));
      const el = h('div.gb-sigils');
      for (const x of list) {
        const isSeen = seen.includes(x.id);
        const on = pick?.kind === kind && pick.id === x.id;
        const gold = kind === 'boss' && isSeen && tamedOf(x.id) > 0 && trophiesOpen();
        const b = h(`button${isSeen ? '' : '.unknown'}${on ? '.on' : ''}${gold ? '.tamed' : ''}`, {
          type: 'button',
          attrs: { 'aria-pressed': String(on), 'aria-label': isSeen ? named(kind, x.id).name : kind === 'omen' ? c.unknownOmenName : c.unknownBossName },
        }, collSigil(kind, x.id, 40));
        b.addEventListener('click', (e) => {
          if (on) return;
          pick = { kind, id: x.id };
          render();
          if (e.detail === 0) body.querySelector<HTMLElement>('.gb-sigils .on')?.focus({ preventScroll: true });
        });
        el.append(b);
      }
      let sub = format(c.opened, { n: seen.length, total: list.length });
      if (kind === 'boss' && trophiesOpen()) sub += ` · ${format(c.tamedShort, { n: BOSS_LIST.filter((b) => tamedOf(b.id) > 0).length })}`;
      return [section(kind === 'omen' ? c.omens : c.bosses, sub), el];
    };
    const skies = h('div.gb-list');
    for (const skyDef of SKY_LIST) {
      const open = p.unlockedSkies.includes(skyDef.id);
      const info = named('sky', skyDef.id);
      skies.append(h(`div.gb-row.static${open ? '' : '.miss'}`, null, h('span.gb-text', null, [h('b', null, open ? info.name : [icon('lock', 'icon gb-lock'), info.name]), h('small', null, info.desc)])));
    }
    const openN = SKY_LIST.filter((x) => p.unlockedSkies.includes(x.id)).length;
    return [statsBlock(), ...(mythsOpen() ? mythList() : []), ...grid('omen'), ...(resonanceOpen() ? legendList() : []), ...grid('boss'), section(c.skies, format(c.opened, { n: openN, total: SKY_LIST.length })), skies];
  };
  // ─── Итоги игрока (CL.2) ─────────────────────────────────────────────────
  /** Общий счёт Коллекции тонкой шкалой — та же, что на полке главной. */
  const progress = () => {
    const tl = collectionTally(opts.profile!);
    return h('div.coll-progress', null, [
      h('span', null, format(c.foundAll, { n: tl.found, total: tl.total })),
      h('span.shelf-bar', { style: `--p: ${tl.total ? Math.round((tl.found / tl.total) * 100) : 0}%`, attrs: { 'aria-hidden': 'true' } }),
    ]);
  };
  /**
   * Итоги первым разделом списка (вариант Б Дениса): строки «подпись · число», уходят вверх
   * при прокрутке. В широком окне тот же блок стоит под доской — левая колонка не пустует.
   */
  const statsBlock = (): HTMLElement => {
    const p = opts.profile!;
    const stat = (label: string, value: string) => h('div.gb-stat', null, [h('span', null, label), h('b', null, value)]);
    return h('div.coll-block', null, [section(c.results, null), progress(), h('div.gb-statrows', null, [
      stat(c.sRuns, num(p.runs)), stat(c.sWins, num(p.wins)), stat(c.sAnte, String(p.bestAnte)),
      stat(c.sBest, num(p.bestPlacement)), stat(c.sLines, num(p.totalLines)), stat(format(c.sOmens, { total: REGULAR.length }), String(REGULAR.filter((x) => p.seenOmens.includes(x.id)).length)),
    ])]);
  };

  const boardOf = (which: GuideTab): [HTMLElement, Child[]] =>
    which === 'combos' ? comboBoard() : which === 'night' ? nightBoard() : which === 'shop' ? shopBoard() : which === 'glyphs' ? (showBody ? bodyBoard() : glyphBoard()) : collectionBoard();

  /**
   * Доска не меняет размер при переключении (замечание Дениса): один раз на вкладку и ширину
   * окна примеряем все варианты — созвездия, шаги ночи, разделы Обсерватории, глифы, всю
   * коллекцию — и держим высоту самого большого.
   */
  const steadyHeights = new Map<string, number>();
  /**
   * Доска Коллекции одной высоты у любого игрока (замечание Дениса): меряем не то, что открыто
   * у него, а всю Коллекцию — найденной целиком и ненайденной, со ступенями и без.
   */
  const collectionProfiles = (): Profile[] => {
    const p = opts.profile!;
    const steps = { eclipses: 99, combosFound: [...COMBO_IDS] };
    const all = { seenOmens: OMEN_LIST.map((x) => x.id), seenBosses: BOSS_LIST.map((x) => x.id), mythsFound: MYTHS.map((x) => x.id) };
    return [
      { ...p, ...steps, ...all, tamed: Object.fromEntries(BOSS_LIST.map((x) => [x.id, 2])) },
      { ...p, ...steps, ...all, tamed: {} },
      // Затмение до ступени трофеев — своя доска, со своим правилом
      { ...p, ...steps, ...all, eclipses: 0 },
      { ...p, ...steps, seenOmens: REGULAR.map((x) => x.id), seenBosses: [], mythsFound: [] },
      { ...p, ...steps, seenOmens: [], seenBosses: [], mythsFound: [] },
    ];
  };
  // Шрифты могли догрузиться после первого замера — меряем заново
  void document.fonts?.ready.then(() => {
    if (!m.el.isConnected || !steadyHeights.size) return;
    steadyHeights.clear();
    render();
  });
  function steadyBoard(board: HTMLElement): void {
    const key = `${tab}:${body.clientWidth}`;
    let max = steadyHeights.get(key);
    if (max === undefined) {
      const saved = { combo, step, shopSel, glyph, bodyId, showBody, pick };
      const variants: (() => void)[] =
        tab === 'combos' ? COMBO_IDS.map((id) => () => { combo = id; })
        : tab === 'night' ? g.steps.map((_, i) => () => { step = i; })
        : tab === 'shop' ? SHOP_IDS.map((id) => () => { shopSel = id; })
        : tab === 'glyphs' ? [...GLYPHS.map((id) => () => { glyph = id; showBody = false; }), ...openBodies.map((id) => () => { bodyId = id; showBody = true; })]
        : collectionProfiles().flatMap((prof) => [
            ...REGULAR.map((x) => () => { opts.profile = prof; pick = { kind: 'omen', id: x.id }; }),
            ...LEGENDS.map((x) => () => { opts.profile = prof; pick = { kind: 'legend', id: x.id }; }),
            ...BOSS_LIST.map((x) => () => { opts.profile = prof; pick = { kind: 'boss', id: x.id }; }),
            ...MYTHS.map((x) => () => { opts.profile = prof; pick = { kind: 'myth', id: x.id }; }),
          ]);
      const live = [...board.childNodes];
      const profile = opts.profile;
      max = board.offsetHeight;
      for (const apply of variants) {
        apply();
        const [vis, tally] = boardOf(tab);
        board.replaceChildren(vis, h('div.gb-tally', null, tally));
        max = Math.max(max, board.offsetHeight);
      }
      opts.profile = profile;
      ({ combo, step, shopSel, glyph, bodyId, showBody, pick } = saved);
      board.replaceChildren(...live);
      steadyHeights.set(key, max);
    }
    board.style.minHeight = `${max}px`;
  }

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
    const [vis, tally] = boardOf(tab);
    const below = tab === 'combos' ? comboList() : tab === 'night' ? nightList() : tab === 'shop' ? shopList() : tab === 'glyphs' ? glyphList() : collectionList();
    // Широкая сцена (Обсерватория) — подпись под ней
    const board = h(`div.gb-board${tab === 'shop' ? '.stack' : ''}`, null, [vis, h('div.gb-tally', { attrs: { 'aria-live': 'polite' } }, tally)]);
    body.replaceChildren(
      h('div.gb-pin', null, [board, tab === 'collection' && only ? statsBlock() : null]),
      h('div.gb-scroll', null, below),
    );
    const scroll = body.querySelector<HTMLElement>('.gb-scroll')!;
    steadyBoard(board);
    scroll.scrollTop = keep;
    shownTab = tab;
    // Шаги ночи идут сами, пока игрок не выбрал шаг
    if (tab === 'night' && auto && !reduced()) later(() => { step = (step + 1) % g.steps.length; render(); }, 3200);
  }

  tabs.forEach((id, i) => {
    const label = id === 'glyphs' && openBodies.length ? g.tabs.cards! : g.tabs[id]!;
    const b = h('button.gb-tab', { type: 'button', dataset: { tab: id }, attrs: { role: 'tab' } }, label);
    b.addEventListener('click', () => {
      if (tab === id) return;
      tab = id;
      render();
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      tab = tabs[(i + d + tabs.length) % tabs.length]!;
      render();
      tabsBar.querySelector<HTMLElement>('.gb-tab.on')?.focus();
    });
    tabsBar.append(b);
  });
  const m = modal(body, {
    title: only ? c.title : g.title,
    className: `board-modal guide-modal${only ? ' collection-modal' : ''}`,
    sheet: opts.sheet,
    headExtra: only ? undefined : tabsBar,
    onClose: () => {
      timers.forEach(clearTimeout);
      opts.onClose?.();
    },
  });
  render();
  // Фокус на строке из подсказки — она видна в списке
  if (focus) requestAnimationFrame(() => body.querySelector('.gb-row.on, .gb-sigils .on')?.scrollIntoView({ block: 'nearest' }));
}
