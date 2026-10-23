import { bossSigil, omenSigil } from '@/art/sigil';
import { omenDef, type OmenKind } from '@/core/content/omens';
import { comboBase } from '@/core/content/combos';
import { omenSlots } from '@/core/shop';
import { COMBO_IDS, type Card, type ComboId, type Glyph, type NightKind, type OmenInstance, type RunState } from '@/core/types';
import { dict, getLang, named, num, t } from '@/i18n';
import { canvasImg, clear, dpr, h } from './dom';
import { rich } from './rich';
import { attachTooltip, button } from './widgets';

export interface HudCallbacks {
  onMenu(): void;
  onGuide(focus?: string): void;
  onBurn(): void;
  onDeck(): void;
}

/** Описание Знамения для подсказок и магазина. */
export function omenTooltip(omen: { id: string; data?: Record<string, number> }): HTMLElement {
  const def = omenDef(omen.id);
  const vars = def.vars?.(omen.data ?? def.initialData?.() ?? {}) ?? {};
  const { name, desc } = named('omen', omen.id, vars);
  const kindDesc = dict().omenKind[def.kind][1];
  return h('div.tip-body', null, [
    h('div.tip-title', null, name),
    h(`div.tip-rarity.r${def.rarity}`, null, t(`rarity.${def.rarity}`)),
    h('div.tip-desc', null, rich(desc)),
    h('div.tip-kind', null, [omenBadge(def.kind), h('span', null, kindDesc)]),
  ]);
}

const BADGE_SYMBOL: Record<OmenKind, string> = { light: '+', mult: '+', xmult: '×', rule: '✦', gold: '●' };

/** Значок типа Знамения: цвет и символ показывают, что оно делает со счётом. */
export function omenBadge(kind: OmenKind): HTMLElement {
  return h(`span.omen-badge.k-${kind}`, { title: dict().omenKind[kind][0] }, BADGE_SYMBOL[kind]);
}

/**
 * Медальон Знамения. Что оно делает со счётом, говорит камешек в оправе самого медальона
 * («Эмаль», FP.4) — отдельный значок поверх больше не нужен; он остался только в подсказке.
 */
export function omenMedal(id: string, size: number): HTMLElement {
  return h('div.omen-medal', { style: { width: `${size}px`, height: `${size}px` } }, [canvasImg(omenSigil(id, size, dpr()), size)]);
}

export function bossTooltip(bossId: string): HTMLElement {
  const { name, desc } = named('boss', bossId);
  return h('div.tip-body', null, [h('div.tip-title.boss', null, name), h('div.tip-desc', null, rich(desc))]);
}

/**
 * HUD ночи. Владеет только DOM: значения ему передают сцена и презентер.
 * Числа счёта анимируются здесь, чтобы презентер просто говорил «стало N».
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly bossBadge: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly score: HTMLElement;
  private readonly target: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly moves: HTMLElement;
  private readonly burns: HTMLElement;
  private readonly omens: HTMLElement;
  /** Широкий ПК, вариант C (CQ.5): созвездия под рамой — свет × множитель с уровнем. */
  readonly combos: HTMLElement;
  private drawnCombos = '';
  private readonly calc: HTMLElement;
  private readonly calcCombo: HTMLElement;
  private readonly calcLight: HTMLElement;
  private readonly calcMult: HTMLElement;
  private readonly calcTotal: HTMLElement;
  private readonly calcCaption: HTMLElement;
  /** Разбор формулы в обучении: база созвездия и вклад каждого шага фишками. */
  private readonly calcParts: HTMLElement;
  private readonly calcLightLabel: HTMLElement;
  private readonly preview: HTMLElement;
  /** Лента с названием созвездия поперёк вспыхнувшей линии — над слоем вспышки. */
  private readonly ribbon: HTMLElement;
  /** Невидимая строка для скринридера: выбор карты, клетка, итог хода. */
  private readonly live: HTMLElement;
  private readonly cardInfo: HTMLElement;
  private cardInfoGlyph: Glyph | null = null;
  readonly actions: HTMLElement;
  readonly guideBtn: HTMLButtonElement;
  readonly burnBtn: HTMLButtonElement;
  readonly deckBtn: HTMLButtonElement;
  private shownScore = 0;
  private scoreAnim = 0;

  constructor(cb: HudCallbacks) {
    this.title = h('div.hud-title');
    this.bossBadge = h('div.hud-rule');
    this.gold = h('div.hud-gold');
    this.score = h('div.hud-score', null, '0');
    this.target = h('div.hud-target');
    this.bar = h('div.hud-bar-fill');
    this.moves = h('div.stat-value');
    this.burns = h('div.stat-value');
    this.omens = h('div.hud-omens');
    this.calcCombo = h('div.calc-combo');
    this.calcLight = h('div.calc-light', null, '0');
    this.calcMult = h('div.calc-mult', null, '0');
    this.calcTotal = h('div.calc-total', null, '?');
    this.calcCaption = h('div.calc-caption');
    this.calcParts = h('div.calc-parts', { attrs: { 'aria-hidden': 'true' } });
    this.calcLightLabel = h('div.calc-label', null, t('calc.light'));
    const cell = (box: HTMLElement, label: string | HTMLElement) =>
      h('div.calc-cell', null, [box, typeof label === 'string' ? h('div.calc-label', null, label) : label]);
    this.calc = h('div.calc', null, [
      this.calcCombo,
      h('div.calc-row', null, [
        cell(this.calcLight, this.calcLightLabel),
        h('span.calc-x', null, '×'),
        cell(this.calcMult, t('calc.mult')),
        h('span.calc-x', null, '='),
        cell(this.calcTotal, t('calc.total')),
      ]),
      this.calcParts,
      this.calcCaption,
    ]);
    this.preview = h('div.preview');
    this.live = h('div.sr-only', { attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });

    const menuBtn = h('button.icon-btn.medal', { type: 'button', ariaLabel: t('pause.title'), onclick: () => cb.onMenu() }, h('span.burger'));
    const guideBtn = (this.guideBtn = h('button.icon-btn.medal.q', { type: 'button', ariaLabel: t('guide.title'), onclick: () => cb.onGuide() }, '?'));
    this.cardInfo = h('div.card-info');
    this.cardInfo.addEventListener('click', () => {
      if (this.cardInfoGlyph) cb.onGuide(`glyph-${this.cardInfoGlyph}`);
    });
    this.ribbon = h('div.combo-ribbon', { attrs: { 'aria-hidden': 'true' } }, [h('b'), h('small')]);
    // «Рама» (RD.1): всё о ночи в одной латунной раме — табличка главы, правило Затмения,
    // счёт с полосой, ходы и сжигания, ряд Знамений и золото
    this.el = h('div.hud', null, [h('div.hud-frame', null, [
      h('div.hud-row.top', null, [menuBtn, h('div.hud-title-wrap', null, this.title), guideBtn]),
      this.bossBadge,
      h('div.hud-row.mid', null, [
        h('div.hud-score-wrap', null, [h('div.row.baseline', null, [this.score, this.target]), h('div.hud-bar', null, this.bar)]),
        h('div.stat', null, [this.moves, h('div.stat-label', null, t('night.moves'))]),
        h('div.stat', null, [this.burns, h('div.stat-label', null, t('night.burns'))]),
      ]),
      h('div.hud-row.omens', null, [this.omens, this.gold]),
    ]), (this.combos = h('div.hud-combos', { attrs: { 'aria-hidden': 'true' } }))]);

    this.deckBtn = button('', () => cb.onDeck(), { variant: 'secondary', className: 'deck-btn' });
    this.burnBtn = button(t('night.burn'), () => cb.onBurn(), { variant: 'secondary', className: 'burn-btn' });
    this.actions = h('div.actions', null, [this.deckBtn, this.burnBtn]);
  }

  mount(root: HTMLElement): void {
    root.append(this.el, this.calc, this.preview, this.cardInfo, this.actions, this.live);
    document.body.append(this.ribbon);
  }

  unmount(): void {
    this.el.remove();
    this.ribbon.remove();
    this.calc.remove();
    this.preview.remove();
    this.cardInfo.remove();
    this.actions.remove();
    this.live.remove();
  }

  /** Сказать скринридеру (вежливо, не перебивая). */
  announce(text: string): void {
    // Тот же текст подряд скринридер не повторит — пересоздаём содержимое
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 30);
  }

  /** Что уже нарисовано в табличке и ряду Знамений: `sync` после хода пересобирает только изменившееся. */
  private drawnHead = '';
  private drawnOmens = '';
  /** Знамения последнего `sync`: подсказка читает свежие счётчики, а не снимок на момент сборки. */
  private omenList: OmenInstance[] = [];

  /** Полное обновление из стейта (кроме счёта — он анимируется отдельно). */
  sync(run: RunState, opts: { score?: boolean } = {}): void {
    const night = run.night;
    const kind = night?.kind ?? 'dusk';
    const head = `${getLang()}|${run.ante}|${kind}|${night?.bossId ?? ''}`;
    const levels = COMBO_IDS.map((id) => run.comboLevels[id] ?? 1).join(',') + getLang();
    if (levels !== this.drawnCombos) {
      this.drawnCombos = levels;
      this.combos.replaceChildren(h('div.hud-combos-title', null, t('combos.title')), ...COMBO_IDS.map((id) => {
        const level = run.comboLevels[id] ?? 1;
        const base = comboBase(id, level);
        return h('div.hud-combo', null, [
          h('span', null, [t(`combo.${id}`), level > 1 ? h('small', null, ` ${t('combos.level', { n: level })}`) : null]),
          h('b', null, [h('i.l', null, num(base.light)), ' × ', h('i.m', null, String(base.mult))]),
        ]);
      }));
    }
    if (head !== this.drawnHead) {
      this.drawnHead = head;
      this.renderHead(run.ante, kind, night?.bossId ?? null);
    }
    this.gold.textContent = `${run.gold}`;
    if (night) {
      this.target.textContent = `/ ${num(night.target)}`;
      this.moves.textContent = String(night.movesLeft);
      this.moves.classList.toggle('low', night.movesLeft <= 3);
      this.burns.textContent = String(night.burnsLeft);
      this.setBurnLabel(night.burnsLeft);
      if (opts.score !== false) this.setScore(night.score, night.target, false);
      this.deckBtn.querySelector('.btn-label')!.textContent = `${t('night.deck')} · ${night.drawPile.length}`;
    }
    this.omenList = run.omens;
    const slots = omenSlots(run);
    const omens = `${getLang()}|${slots}|${run.omens.map((o) => `${o.uid}:${o.id}`).join(',')}`;
    if (omens !== this.drawnOmens) {
      this.drawnOmens = omens;
      this.renderOmens(run.omens, slots);
    }
  }

  private renderHead(ante: number, kind: NightKind, bossId: string | null): void {
    // Глава — отдельным кусочком: в тесном заголовке (ландшафт) остаётся только ночь
    this.title.replaceChildren(h('span.hud-chapter', null, `${t('night.constellation', { n: ante })} · `), t(`night.${kind}`));
    clear(this.bossBadge);
    this.title.parentElement?.classList.toggle('boss', !!bossId);
    // Затмение: рама в жемчужной короне, правило — одной строкой с сигилом под табличкой
    this.el.classList.toggle('boss', !!bossId);
    if (bossId) {
      const icon = canvasImg(bossSigil(bossId, 24, dpr()), 24);
      // Кнопка, а не подпись: правило Затмения можно открыть касанием в любой момент ночи
      const boss = named('boss', bossId);
      const badge = h('button.boss-chip', { type: 'button', ariaLabel: `${boss.name}: ${boss.desc}` }, [icon, h('span.boss-chip-name', null, `${boss.name}: ${boss.desc.charAt(0).toLocaleLowerCase()}${boss.desc.slice(1)}`)]);
      attachTooltip(badge, () => bossTooltip(bossId));
      this.bossBadge.append(badge);
    }
  }

  private renderOmens(omens: OmenInstance[], slots: number): void {
    clear(this.omens);
    // Пока Знамений нет, пустой ряд только отнимает место у неба
    this.omens.classList.toggle('none', omens.length === 0);
    for (let i = 0; i < slots; i++) {
      const omen = omens[i];
      if (!omen) {
        this.omens.append(h('div.omen-slot.empty'));
        continue;
      }
      const el = h('div.omen-slot', { dataset: { uid: String(omen.uid) } }, omenMedal(omen.id, 34));
      attachTooltip(el, () => omenTooltip(this.omenList.find((o) => o.uid === omen.uid) ?? omen));
      this.omens.append(el);
    }
  }

  setGold(gold: number): void {
    this.gold.textContent = String(gold);
    this.gold.classList.remove('pop');
    void this.gold.offsetWidth;
    this.gold.classList.add('pop');
  }

  setMoves(moves: number, burns: number): void {
    this.moves.textContent = String(moves);
    this.moves.classList.toggle('low', moves <= 3);
    this.burns.textContent = String(burns);
    this.setBurnLabel(burns);
  }

  /** «Сжечь · 2» — сколько сжиганий осталось видно прямо на кнопке. */
  private setBurnLabel(burns: number): void {
    this.burnBtn.querySelector('.btn-label')!.textContent = `${t('night.burn')} · ${burns}`;
  }

  setDeckCount(n: number): void {
    this.deckBtn.querySelector('.btn-label')!.textContent = `${t('night.deck')} · ${n}`;
  }

  /** Счёт ночи: плавно докручивается до значения. */
  setScore(score: number, target: number, animate = true): void {
    const from = this.shownScore;
    this.shownScore = score;
    this.bar.style.transform = `scaleX(${Math.min(1, score / target)})`;
    this.bar.classList.toggle('done', score >= target);
    cancelAnimationFrame(this.scoreAnim);
    if (!animate) {
      this.score.textContent = num(score);
      return;
    }
    const start = performance.now();
    const dur = 600;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      this.score.textContent = num(from + (score - from) * (1 - (1 - k) ** 3));
      if (k < 1) this.scoreAnim = requestAnimationFrame(step);
    };
    this.scoreAnim = requestAnimationFrame(step);
    this.score.classList.remove('pop');
    void this.score.offsetWidth;
    this.score.classList.add('pop');
  }

  /** Тряхнуть медальон Знамения, когда оно срабатывает. Возвращает его центр. */
  pulseOmen(uid: number): { x: number; y: number } | null {
    const el = this.omens.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
    if (!el) return null;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  }

  bossAnchor(): { x: number; y: number } {
    const r = this.bossBadge.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  }

  showCalc(combo: ComboId, light: number, mult: number): void {
    this.calcCombo.textContent = t(`combo.${combo}`);
    this.setCalcMode('line');
    this.calcTotal.textContent = '?';
    this.calcTotal.classList.remove('done');
    this.calcCaption.textContent = '';
    this.calcParts.replaceChildren();
    this.setCalc(light, mult);
    this.calc.classList.add('show');
    document.body.classList.add('scoring');
  }

  /**
   * Откуда числа формулы (TU.3): первая фишка — база созвездия (свет и множитель, с которых
   * всё начинается), дальше — вклад каждого шага. Фишки шагов тусклые и загораются по очереди.
   */
  showParts(combo: ComboId, light: number, mult: number, parts: { text: string; kind: 'light' | 'mult' }[]): void {
    const base = h('span.calc-part.base', null, [
      h('small', null, t('calc.base', { combo: t(`combo.${combo}`) })),
      h('b.light', null, num(light)),
      h('b.mult', null, `×${num(mult)}`),
    ]);
    this.calcParts.replaceChildren(base, ...parts.map((p) => h(`span.calc-part.${p.kind}.dim`, null, p.text)));
  }

  /** Зажечь фишку шага `index` (по порядку шагов после базы). */
  lightPart(index: number): void {
    const el = this.calcParts.children[index + 1];
    if (!el) return;
    el.classList.remove('dim');
    el.classList.add('lit');
  }

  /** Обучение запирает шапку и кнопки ночи; `allowBurn` — «Сжечь» остаётся живой. */
  setTutorialLock(on: boolean, allowBurn = false): void {
    this.el.classList.toggle('tut-lock', on);
    this.actions.classList.toggle('tut-lock', on);
    this.burnBtn.classList.toggle('tut-allow', on && allowBurn);
  }

  setCalcLabel(text: string): void {
    this.calcCombo.textContent = text;
  }

  /**
   * Что стоит в левой ячейке формулы: свет линии или — на шагах всего хода (крест,
   * Знамения «×» хода) — уже посчитанные очки линий. Подпись и цвет меняются вместе,
   * чтобы «очки = свет × множитель» не путалось в самый яркий момент.
   */
  setCalcMode(mode: 'line' | 'move'): void {
    this.calcLight.classList.toggle('points', mode === 'move');
    this.calcLightLabel.textContent = t(mode === 'move' ? 'calc.total' : 'calc.light');
  }

  setCalc(light: number, mult: number, flash?: 'light' | 'mult'): void {
    this.calcLight.textContent = num(light);
    this.calcMult.textContent = Number.isInteger(mult) ? num(mult) : mult.toFixed(1);
    const el = flash === 'light' ? this.calcLight : flash === 'mult' ? this.calcMult : null;
    if (el) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  /** Центр ячейки формулы на экране — туда прилетает искра шага подсчёта. */
  calcAnchor(kind: 'light' | 'mult'): { x: number; y: number } | null {
    if (!this.calc.classList.contains('show')) return null;
    const r = (kind === 'light' ? this.calcLight : this.calcMult).getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  /**
   * Поставить панель подсчёта сверху или снизу. Снизу — когда сверху она закрыла бы
   * вспыхнувшие карты (низкие экраны, линия в верхнем ряду).
   */
  placeCalc(_avoidTop: number | null): void {
    // «Рама»: лоток всегда над рукой (на ПК и в ландшафте — в колонке под табло),
    // вспыхнувших карт он не закрывает. Место задаёт сцена через --calc-*.
  }

  /** Лента с названием созвездия поперёк линии; y — центр линии в координатах экрана. */
  showRibbon(name: string, desc: string, y: number): void {
    this.ribbon.querySelector('b')!.textContent = name;
    this.ribbon.querySelector('small')!.textContent = desc;
    this.ribbon.style.top = `${y}px`;
    this.ribbon.classList.remove('show', 'hide');
    void this.ribbon.offsetWidth;
    this.ribbon.classList.add('show');
    this.announce(`${name}. ${desc}`);
  }

  hideRibbon(): void {
    this.ribbon.classList.replace('show', 'hide');
  }

  /** Пояснение текущего шага подсчёта простыми словами. */
  setCaption(text: string): void {
    this.calcCaption.textContent = text;
    this.calcCaption.classList.remove('flash');
    void this.calcCaption.offsetWidth;
    this.calcCaption.classList.add('flash');
  }

  setCalcTotal(total: number): void {
    this.calcTotal.textContent = num(total);
    this.calcTotal.classList.add('done');
    this.calcTotal.classList.remove('bump');
    void this.calcTotal.offsetWidth;
    this.calcTotal.classList.add('bump');
  }

  hideCalc(): void {
    this.calc.classList.remove('show');
    document.body.classList.remove('scoring');
  }

  /** Превью хода: какие созвездия вспыхнут и примерно сколько дадут. */
  setPreview(lines: { combo: ComboId; total: number }[] | null, total = 0): void {
    clear(this.preview);
    if (!lines || lines.length === 0) {
      this.preview.classList.remove('show');
      return;
    }
    const names = lines.map((l) => t(`combo.${l.combo}`)).join(' + ');
    this.preview.append(h('span.preview-combo', null, names), h('span.preview-total', null, `≈ ${num(total)}`));
    this.preview.classList.add('show');
  }

  /** Подпись о выбранной карте: ранг, масть и глиф простыми словами. */
  setCardInfo(card: Card | null, hideRank = false): void {
    clear(this.cardInfo);
    this.cardInfoGlyph = card?.glyph ?? null;
    if (!card) {
      this.cardInfo.classList.remove('show');
      return;
    }
    const name = `${hideRank ? '?' : card.rank} · ${t(`suitPl.${card.suit}`)}`;
    this.cardInfo.append(h('b', null, name));
    if (card.glyph) {
      this.cardInfo.append(h('span', null, ` · ${t(`glyph.${card.glyph}`)}: `), rich(dict().glyphDesc[card.glyph]), h('span.more', null, ' ⓘ'));
    }
    this.cardInfo.classList.toggle('clickable', !!card.glyph);
    this.cardInfo.classList.add('show');
  }

  /** Подсветить «?», пока новичок её ни разу не открыл. */
  setGuideAttention(on: boolean): void {
    this.guideBtn.classList.toggle('attn', on);
  }

  setBurnEnabled(enabled: boolean): void {
    this.burnBtn.disabled = !enabled;
  }

  /** Карту тащат: «Сжечь» становится целью броска (ready) или карта уже над ней (hover). */
  setBurnDrop(state: 'ready' | 'hover' | null): void {
    this.burnBtn.classList.toggle('drop-ready', state !== null);
    this.burnBtn.classList.toggle('drop-hover', state === 'hover');
    if (state !== null) this.burnBtn.disabled = false;
  }

  scoreAnchor(): { x: number; y: number } {
    const r = this.score.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
