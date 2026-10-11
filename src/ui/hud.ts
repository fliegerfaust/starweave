import { bossSigil, omenSigil } from '@/art/sigil';
import { omenDef } from '@/core/content/omens';
import { omenSlots } from '@/core/shop';
import type { ComboId, OmenInstance, RunState } from '@/core/types';
import { named, num, t } from '@/i18n';
import { canvasImg, clear, dpr, h } from './dom';
import { attachTooltip, button } from './widgets';

export interface HudCallbacks {
  onMenu(): void;
  onBurn(): void;
  onDeck(): void;
}

/** Описание Знамения для подсказок и магазина. */
export function omenTooltip(omen: { id: string; data?: Record<string, number> }): HTMLElement {
  const def = omenDef(omen.id);
  const vars = def.vars?.(omen.data ?? def.initialData?.() ?? {}) ?? {};
  const { name, desc } = named('omen', omen.id, vars);
  return h('div.tip-body', null, [
    h('div.tip-title', null, name),
    h(`div.tip-rarity.r${def.rarity}`, null, t(`rarity.${def.rarity}`)),
    h('div.tip-desc', null, desc),
  ]);
}

export function bossTooltip(bossId: string): HTMLElement {
  const { name, desc } = named('boss', bossId);
  return h('div.tip-body', null, [h('div.tip-title.boss', null, name), h('div.tip-desc', null, desc)]);
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
  private readonly preview: HTMLElement;
  readonly actions: HTMLElement;
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
    this.calc = h('div.calc', null, [this.calcCombo, h('div.calc-row', null, [this.calcLight, h('span.calc-x', null, '×'), this.calcMult])]);
    this.preview = h('div.preview');

    const menuBtn = h('button.icon-btn', { type: 'button', ariaLabel: 'menu', onclick: () => cb.onMenu() }, h('span.burger'));
    this.el = h('div.hud', null, [
      h('div.hud-row.top', null, [menuBtn, h('div.hud-title-wrap', null, [this.title, this.bossBadge]), this.gold]),
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
    root.append(this.el, this.calc, this.preview, this.actions);
  }

  unmount(): void {
    this.el.remove();
    this.calc.remove();
    this.preview.remove();
    this.actions.remove();
  }

  /** Полное обновление из стейта (кроме счёта — он анимируется отдельно). */
  sync(run: RunState, opts: { score?: boolean } = {}): void {
    const night = run.night;
    const kind = night?.kind ?? 'dusk';
    this.title.textContent = `${t('night.constellation', { n: run.ante })} · ${t(`night.${kind}`)}`;
    clear(this.bossBadge);
    if (night?.bossId) {
      const icon = canvasImg(bossSigil(night.bossId, 28, dpr()), 28);
      const badge = h('span.boss-chip', null, [icon, named('boss', night.bossId).name]);
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
    for (let i = 0; i < slots; i++) {
      const omen = omens[i];
      if (!omen) {
        this.omens.append(h('div.omen-slot.empty'));
        continue;
      }
      const el = h('div.omen-slot', { dataset: { uid: String(omen.uid) } }, canvasImg(omenSigil(omen.id, 40, dpr()), 40));
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
    this.bar.style.width = `${Math.min(100, (score / target) * 100)}%`;
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
    this.setCalc(light, mult);
    this.calc.classList.add('show');
  }

  setCalcLabel(text: string): void {
    this.calcCombo.textContent = text;
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

  hideCalc(): void {
    this.calc.classList.remove('show');
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

  setBurnEnabled(enabled: boolean): void {
    this.burnBtn.disabled = !enabled;
  }

  scoreAnchor(): { x: number; y: number } {
    const r = this.score.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
