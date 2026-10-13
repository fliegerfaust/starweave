import { bossSigil, omenSigil } from '@/art/sigil';
import { omenDef, type OmenKind } from '@/core/content/omens';
import { omenSlots } from '@/core/shop';
import type { Card, ComboId, Glyph, OmenInstance, RunState } from '@/core/types';
import { dict, named, num, t } from '@/i18n';
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

/** Медальон Знамения со значком типа. */
export function omenMedal(id: string, size: number): HTMLElement {
  const def = omenDef(id);
  return h('div.omen-medal', { style: { width: `${size}px`, height: `${size}px` } }, [canvasImg(omenSigil(id, size, dpr()), size), omenBadge(def.kind)]);
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
  private readonly calc: HTMLElement;
  private readonly calcCombo: HTMLElement;
  private readonly calcLight: HTMLElement;
  private readonly calcMult: HTMLElement;
  private readonly calcTotal: HTMLElement;
  private readonly calcCaption: HTMLElement;
  private readonly calcLightLabel: HTMLElement;
  private readonly preview: HTMLElement;
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
    this.bossBadge = h('div.hud-boss');
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
      this.calcCaption,
    ]);
    this.preview = h('div.preview');

    const menuBtn = h('button.icon-btn', { type: 'button', ariaLabel: 'menu', onclick: () => cb.onMenu() }, h('span.burger'));
    const guideBtn = (this.guideBtn = h('button.icon-btn.q', { type: 'button', ariaLabel: 'guide', onclick: () => cb.onGuide() }, '?'));
    this.cardInfo = h('div.card-info');
    this.cardInfo.addEventListener('click', () => {
      if (this.cardInfoGlyph) cb.onGuide(`glyph-${this.cardInfoGlyph}`);
    });
    this.el = h('div.hud', null, [
      h('div.hud-row.top', null, [menuBtn, guideBtn, h('div.hud-title-wrap', null, [this.title, this.bossBadge]), this.gold]),
      h('div.hud-row.mid', null, [
        h('div.hud-score-wrap', null, [h('div.row.baseline', null, [this.score, this.target]), h('div.hud-bar', null, this.bar)]),
        h('div.stat', null, [h('div.stat-label', null, t('night.moves')), this.moves]),
        h('div.stat', null, [h('div.stat-label', null, t('night.burns')), this.burns]),
      ]),
      this.omens,
    ]);

    this.deckBtn = button('', () => cb.onDeck(), { variant: 'secondary', className: 'deck-btn' });
    this.burnBtn = button(t('night.burn'), () => cb.onBurn(), { variant: 'secondary', className: 'burn-btn' });
    this.actions = h('div.actions', null, [this.deckBtn, this.burnBtn]);
  }

  mount(root: HTMLElement): void {
    root.append(this.el, this.calc, this.preview, this.cardInfo, this.actions);
  }

  unmount(): void {
    this.el.remove();
    this.calc.remove();
    this.preview.remove();
    this.cardInfo.remove();
    this.actions.remove();
  }

  /** Полное обновление из стейта (кроме счёта — он анимируется отдельно). */
  sync(run: RunState, opts: { score?: boolean } = {}): void {
    const night = run.night;
    const kind = night?.kind ?? 'dusk';
    // Глава — отдельным кусочком: в тесном заголовке (ландшафт) остаётся только ночь
    this.title.replaceChildren(h('span.hud-chapter', null, `${t('night.constellation', { n: run.ante })} · `), t(`night.${kind}`));
    clear(this.bossBadge);
    if (night?.bossId) {
      const icon = canvasImg(bossSigil(night.bossId, 28, dpr()), 28);
      const badge = h('span.boss-chip', null, [icon, h('span.boss-chip-name', null, named('boss', night.bossId).name)]);
      attachTooltip(badge, () => bossTooltip(night.bossId!));
      this.bossBadge.append(badge);
    }
    this.gold.textContent = `${run.gold}`;
    if (night) {
      this.target.textContent = `/ ${num(night.target)}`;
      this.moves.textContent = String(night.movesLeft);
      this.moves.classList.toggle('low', night.movesLeft <= 3);
      this.burns.textContent = String(night.burnsLeft);
      if (opts.score !== false) this.setScore(night.score, night.target, false);
      this.deckBtn.querySelector('.btn-label')!.textContent = `${t('night.deck')} · ${night.drawPile.length}`;
    }
    this.renderOmens(run.omens, omenSlots(run));
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
      const el = h('div.omen-slot', { dataset: { uid: String(omen.uid) } }, omenMedal(omen.id, 40));
      attachTooltip(el, () => omenTooltip(omen));
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
    this.setCalc(light, mult);
    this.calc.classList.add('show');
    document.body.classList.add('scoring');
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

  /**
   * Поставить панель подсчёта сверху или снизу. Снизу — когда сверху она закрыла бы
   * вспыхнувшие карты (низкие экраны, линия в верхнем ряду).
   */
  placeCalc(avoidTop: number | null): void {
    this.calc.classList.remove('bottom');
    if (avoidTop === null) return;
    const r = this.calc.getBoundingClientRect();
    // Панель в момент показа ещё «выпрыгивает» — оцениваем по высоте без анимации
    const bottom = r.top + this.calc.offsetHeight;
    if (bottom > avoidTop + 4) this.calc.classList.add('bottom');
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
