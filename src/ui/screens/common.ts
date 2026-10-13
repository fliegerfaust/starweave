import { cardFace } from '@/art/card';
import { LANGS, dict, getLang, num, t, type Lang } from '@/i18n';
import type { Card, ComboId, RunState } from '@/core/types';
import { SUITS } from '@/core/types';
import type { App } from '@/game/app';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';
import { Haptics } from '@/engine/haptics';
import { SPEEDS } from '@/meta/settings';
import { canFullscreen, enterFullscreen } from '@/platform/fullscreen';
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
        const toggle = () => {
          opts.onToggle!(card);
          const on = opts.selected?.has(card.id) ?? false;
          cell.classList.toggle('selected', on);
          cell.setAttribute('aria-pressed', String(on));
        };
        // Выбор карт для ритуала — и с клавиатуры: Tab по картам, Enter/пробел
        cell.tabIndex = 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-pressed', String(opts.selected?.has(card.id) ?? false));
        cell.setAttribute('aria-label', `${card.rank} · ${t(`suitPl.${card.suit}`)}${card.glyph ? ` · ${t(`glyph.${card.glyph}`)}` : ''}`);
        cell.addEventListener('click', toggle);
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
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

/** Справка — одно окно с вкладками (созвездия, ночь, Обсерватория, глифы). */
export function showHelp(opts: import('./guide').GuideOptions = {}): void {
  void import('./guide').then(({ showGuide }) => showGuide(opts));
}

/** «Собрано 4 из 10» — прогресс коллекции созвездий. */
export function collectedLine(found: readonly ComboId[]): HTMLElement {
  return h('p.combo-collected', null, t('discovery.collected', { n: found.length, total: COLLECTIBLE_COMBOS.length }));
}

/** Справка на вкладке созвездий: уровни забега и коллекция игрока. */
export function showCombos(run: RunState, found: readonly ComboId[] = [], sheet = false): void {
  showHelp({ tab: 'combos', levels: run.comboLevels, found, sheet });
}

/** Кодекс (Знамения, Затмения, созвездия) — доступен и посреди забега. */
export function showCodexFrom(app: App): void {
  void import('./codex').then(({ showCodex }) => showCodex(app));
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
    const wrap = h('div.segmented', { attrs: { role: 'group' } });
    for (const o of options) {
      const b = h('button.seg', { type: 'button', attrs: { 'aria-pressed': String(o.value === current) } }, o.label);
      if (o.value === current) b.classList.add('on');
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.seg').forEach((x) => {
          x.classList.remove('on');
          x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on');
        b.setAttribute('aria-pressed', 'true');
        set(o.value);
        apply();
      });
      wrap.append(b);
    }
    return wrap;
  };
  // <label> только для ползунка: вокруг кнопок он «нажимал» первую при касании подписи
  let fieldSeq = 0;
  const field = (label: string, control: HTMLElement) => {
    if (control instanceof HTMLInputElement) return h('label.field', null, [h('span.field-label', null, label), control]);
    const id = `field-${++fieldSeq}`;
    control.setAttribute('aria-labelledby', id);
    return h('div.field', null, [h('span.field-label', { id }, label), control]);
  };
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
      !Haptics.supported() ? null : field(t('settings.haptics'), segmented([{ value: false, label: t('settings.off') }, { value: true, label: t('settings.on') }], s.haptics, (v) => {
        s.haptics = v;
        if (v) app.svc.haptics.play('success');
      })),
      app.platform.id === 'web' && canFullscreen()
        ? field(t('settings.fullscreen'), segmented([{ value: false, label: t('settings.off') }, { value: true, label: t('settings.on') }], s.fullscreen, (v) => {
            s.fullscreen = v;
            if (v) enterFullscreen();
            else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          }))
        : null,
      field(t('settings.quality'), segmented([{ value: 'auto' as const, label: t('settings.qualityAuto') }, { value: 'max' as const, label: t('settings.qualityMax') }], s.quality, (v) => (s.quality = v))),
      h('p.hint', null, t('settings.qualityNow', { now: app.svc.renderer.dpr, max: Math.min(3, window.devicePixelRatio || 1) })),
      field(t('settings.reduceMotion'), segmented([{ value: false, label: t('settings.off') }, { value: true, label: t('settings.on') }], s.reduceMotion, (v) => (s.reduceMotion = v))),
      h('div.row.gap.wrap.legal-links', null, [
        button(t('settings.privacy'), () => void import('./legal').then(({ showLegal }) => showLegal('privacy')), { variant: 'ghost', className: 'small' }),
        button(t('settings.terms'), () => void import('./legal').then(({ showLegal }) => showLegal('terms')), { variant: 'ghost', className: 'small' }),
      ]),
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

/** Кнопка-бургер для экранов забега. */
export function menuButton(onClick: () => void): HTMLElement {
  const b = h('button.icon-btn', { type: 'button', ariaLabel: t('pause.title') }, h('span.burger'));
  b.addEventListener('click', onClick);
  return b;
}

/** Меню забега вне ночи: справочник, настройки, выход в главное меню, сдаться. */
export function showRunMenu(app: App, extra: HTMLElement[] = []): void {
  const m = modal(
    [
      h('div.stack', null, [
        button(t('pause.resume'), () => m.close()),
        ...extra,
        button(t('guide.button'), () => showHelp({ levels: app.run?.comboLevels, found: app.profile.combosFound }), { variant: 'secondary' }),
        button(t('menu.codex'), () => showCodexFrom(app), { variant: 'secondary' }),
        button(t('settings.title'), () => showSettings(app), { variant: 'secondary' }),
        button(t('pause.toMenu'), () => {
          m.close();
          app.save();
          void app.goMenu();
        }, { variant: 'secondary' }),
        button(t('pause.abandon'), () => confirmDialog(t('pause.abandonConfirm'), () => {
          m.close();
          app.abandonRun();
        }, 'danger', { yes: t('pause.abandon'), no: t('pause.keepPlaying') }), { variant: 'ghost' }),
      ]),
    ],
    { title: t('pause.title'), className: 'narrow' },
  );
}
