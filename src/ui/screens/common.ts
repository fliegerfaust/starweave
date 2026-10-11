import { cardFace } from '@/art/card';
import { LANGS, dict, getLang, num, t, type Lang } from '@/i18n';
import type { Card, RunState } from '@/core/types';
import { SUITS } from '@/core/types';
import type { App } from '@/game/app';
import { SPEEDS } from '@/meta/settings';
import { canvasImg, dpr, h } from '../dom';
import { button, confirmDialog, modal } from '../widgets';

export const CARD_THUMB = 46;

/** Миниатюра карты для DOM-сеток. */
export function cardThumb(card: Card, width = CARD_THUMB, opts: { hideRank?: boolean } = {}): HTMLCanvasElement {
  const pad = Math.ceil(width * 0.12);
  const img = cardFace(card, width, dpr(), opts);
  const c = canvasImg(img, width + pad * 2, width / 0.7 + pad * 2, 'card-thumb');
  c.style.margin = `${-pad}px`;
  return c;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank || a.id - b.id);
}

/** Сетка колоды по мастям. `dimmed` — id карт, которых уже нет в колоде ночи. */
export function deckGrid(cards: Card[], opts: { dimmed?: Set<number>; selectable?: (c: Card) => boolean; selected?: Set<number>; onToggle?: (c: Card) => void } = {}): HTMLElement {
  const grid = h('div.deck-grid');
  for (const suit of SUITS) {
    const row = sortCards(cards.filter((c) => c.suit === suit));
    if (!row.length) continue;
    const line = h('div.deck-row');
    for (const card of row) {
      const can = opts.selectable ? opts.selectable(card) : true;
      const cell = h('div.deck-card', null, cardThumb(card));
      if (opts.dimmed?.has(card.id)) cell.classList.add('dim');
      if (!can) cell.classList.add('disabled');
      if (opts.selected?.has(card.id)) cell.classList.add('selected');
      if (opts.onToggle && can) {
        cell.addEventListener('click', () => {
          opts.onToggle!(card);
          cell.classList.toggle('selected', opts.selected?.has(card.id) ?? false);
        });
      }
      line.append(cell);
    }
    grid.append(line);
  }
  return grid;
}

export function showDeck(run: RunState): void {
  const night = run.night;
  const dimmed = new Set<number>();
  if (night) {
    const inPile = new Set(night.drawPile.map((c) => c.id));
    for (const c of run.deck) if (!inPile.has(c.id)) dimmed.add(c.id);
  }
  const count = night ? night.drawPile.length : run.deck.length;
  const m = modal([deckGrid(run.deck, { dimmed }), h('div.row.end', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))], {
    title: `${t('night.deck')} · ${count}/${run.deck.length}`,
    className: 'wide',
  });
}

export function showHelp(): void {
  const m = modal(
    [
      h('ol.help-list', null, dict().help.body.map((line) => h('li', null, line))),
      h('div.row.end', null, button(t('tutorial.gotIt'), () => m.close())),
    ],
    { title: t('help.title') },
  );
}

/** Окно настроек; изменения применяются сразу. */
export function showSettings(app: App, onChange?: () => void): void {
  const s = { ...app.settings };
  const apply = () => {
    app.applySettings({ ...s });
    onChange?.();
  };
  const slider = (value: number, set: (v: number) => void) => {
    const input = h('input.slider', { type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)) });
    input.addEventListener('input', () => {
      set(Number(input.value) / 100);
      apply();
    });
    return input;
  };
  const segmented = <T,>(options: { value: T; label: string }[], current: T, set: (v: T) => void) => {
    const wrap = h('div.segmented');
    for (const o of options) {
      const b = h('button.seg', { type: 'button' }, o.label);
      if (o.value === current) b.classList.add('on');
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.seg').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        set(o.value);
        apply();
      });
      wrap.append(b);
    }
    return wrap;
  };
  const field = (label: string, control: Node) => h('label.field', null, [h('span.field-label', null, label), control]);
  const langNames: Record<Lang, string> = { ru: 'Русский', en: 'English' };
  const m = modal(
    [
      field(
        t('settings.language'),
        segmented(LANGS.map((l) => ({ value: l, label: langNames[l] })), getLang(), (v) => {
          s.lang = v;
          app.applySettings({ ...s });
          m.close();
          onChange?.();
          showSettings(app, onChange);
        }),
      ),
      field(t('settings.sfx'), slider(s.sfx, (v) => (s.sfx = v))),
      field(t('settings.music'), slider(s.music, (v) => (s.music = v))),
      field(t('settings.speed'), segmented(SPEEDS.map((_, i) => ({ value: i, label: dict().settings.speeds[i]! })), s.speed, (v) => (s.speed = v))),
      field(t('settings.reduceMotion'), segmented([{ value: false, label: t('settings.off') }, { value: true, label: t('settings.on') }], s.reduceMotion, (v) => (s.reduceMotion = v))),
      h('div.row.between', null, [
        button(t('settings.reset'), () => confirmDialog(t('settings.resetConfirm'), () => {
          m.close();
          app.resetProgress();
        }), { variant: 'ghost' }),
        button(t('menu.back'), () => m.close(), { variant: 'secondary' }),
      ]),
    ],
    { title: t('settings.title') },
  );
}

export function statsGrid(run: RunState): HTMLElement {
  const s = run.stats;
  const item = (label: string, value: string) => h('div.stat-item', null, [h('div.stat-item-value', null, value), h('div.stat-item-label', null, label)]);
  return h('div.stats-grid', null, [
    item(t('over.nights'), String(s.nightsWon)),
    item(t('over.lines'), num(s.linesIgnited)),
    item(t('over.crosses'), num(s.crosses)),
    item(t('over.best'), num(s.bestPlacement)),
    item(t('over.bestCombo'), t(`combo.${s.bestCombo}`)),
    item(t('over.goldEarned'), num(s.goldEarned)),
  ]);
}

/** Заголовок экрана: декоративная строка со звёздочками. */
export function screenTitle(text: string, sub?: string): HTMLElement {
  return h('div.screen-title', null, [h('div.title-ornament', null, '✦'), h('h1', null, text), sub ? h('div.screen-sub', null, sub) : null]);
}
