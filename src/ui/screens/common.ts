import { currentNode } from '@/core/route';
import { cardFace } from '@/art/card';
import { LANGS, dict, getLang, num, t, type Lang } from '@/i18n';
import type { Card, ComboId, RunState } from '@/core/types';
import { SUITS } from '@/core/types';
import type { App } from '@/game/app';
import { Haptics } from '@/engine/haptics';
import { SPEEDS } from '@/meta/settings';
import { canFullscreen, enterFullscreen } from '@/platform/fullscreen';
import { canvasImg, dpr, h } from '../dom';
import { icon } from '../icons';
import { button, confirmDialog, modal, withCoin } from '../widgets';
import { omenMedal } from '../hud';

export const CARD_THUMB = 46;

/** Миниатюра карты для DOM-сеток. */
export function cardThumb(card: Card, width = CARD_THUMB, opts: { hideRank?: boolean } = {}): HTMLCanvasElement {
  const pad = Math.ceil(width * 0.12);
  const img = cardFace(card, width, dpr(), opts);
  const c = canvasImg(img, width + pad * 2, width / 0.7 + pad * 2, 'card-thumb');
  c.style.margin = `${-pad}px`;
  return c;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/**
 * Новый забег поверх сохранённого — «Табличка» (RD.10): что именно пропадёт, строкой —
 * глава и ночь, золото и Знамения забега.
 */
export function confirmNewRun(app: App, next: () => void): void {
  if (!app.runs.hasSave || !app.run) return next();
  const run = app.run;
  const where = `${t('night.constellation', { n: ROMAN[run.ante - 1] ?? run.ante })} · ${t(`night.${currentNode(run).kind}`)}`;
  const line = h('div.run-line', null, [
    h('span.run-line-text', null, [h('b', null, where), withCoin(num(run.gold))]),
    run.omens.length ? h('span.run-line-omens', null, run.omens.slice(0, 4).map((o) => omenMedal(o.id, 30))) : null,
  ]);
  confirmDialog(t('menu.overwrite'), next, 'primary', { yes: t('menu.restart'), no: t('menu.keep') }, { title: t('menu.overwriteTitle'), extra: line });
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank || a.id - b.id);
}

type DeckGridOpts = { dimmed?: Set<number>; selectable?: (c: Card) => boolean; selected?: Set<number>; onToggle?: (c: Card) => void };

/** Сетка колоды по мастям; небесные тела — отдельным рядом под звёздами (GF.5). `dimmed` — id карт, которых уже нет в колоде ночи. */
export function deckGrid(cards: Card[], opts: DeckGridOpts = {}): HTMLElement {
  const grid = h('div.deck-grid');
  for (const suit of SUITS) {
    const row = sortCards(cards.filter((c) => c.suit === suit && !c.body));
    if (row.length) grid.append(deckRow(row, opts));
  }
  const bodies = sortCards(cards.filter((c) => c.body));
  if (bodies.length) grid.append(h('div.deck-label', null, t('deck.bodies')), deckRow(bodies, opts, 'bodies'));
  return grid;
}

function deckRow(cards: Card[], opts: DeckGridOpts, kind = ''): HTMLElement {
  const line = h(`div.deck-row${kind ? `.${kind}` : ''}`);
  for (const card of cards) {
    const can = opts.selectable ? opts.selectable(card) : true;
    const cell = h('div.deck-card', null, cardThumb(card, card.body ? CARD_THUMB + 8 : CARD_THUMB));
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
      cell.setAttribute('aria-label', `${card.rank} · ${t(`suitPl.${card.suit}`)}${card.glyph ? ` · ${t(`glyph.${card.glyph}`)}` : ''}${card.body ? ` · ${t(`body.${card.body}`)}` : ''}`);
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
  return line;
}

/** Колода — нижний лист (в ландшафте — панель слева): масти рядами, сыгранные приглушены. */
export function showDeck(run: RunState): void {
  const night = run.night;
  const dimmed = new Set<number>();
  if (night) {
    const inPile = new Set(night.drawPile.map((c) => c.id));
    for (const c of run.deck) if (!inPile.has(c.id)) dimmed.add(c.id);
  }
  const count = night ? night.drawPile.length : run.deck.length;
  const legend = night
    ? h('div.deck-legend', null, [h('span', null, [h('i'), t('deck.left', { n: count, total: run.deck.length })]), h('span', null, [h('i.used'), t('deck.played', { n: dimmed.size })])])
    : null;
  const m = modal([deckGrid(run.deck, { dimmed }), legend, h('div.deck-back', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))], {
    title: night ? t('night.deck') : `${t('night.deck')} · ${run.deck.length}`,
    sheet: true,
    className: 'deck',
  });
}

/** Справочник — одно окно с вкладками правил (созвездия, ночь, Обсерватория, карты). */
export function showHelp(opts: import('./guide').GuideOptions = {}): void {
  void import('./guide').then(({ showGuide }) => showGuide(opts));
}

/** Коллекция игрока — своё окно (CL.2), с фокусом на находке или разделе. */
export function showCollection(profile: import('@/meta/profile').Profile, focus?: string): void {
  void import('./guide').then((m) => m.showCollection(profile, focus));
}

/** Справка на вкладке созвездий: уровни забега и коллекция игрока. */
export function showCombos(run: RunState, found: readonly ComboId[] = [], sheet = false): void {
  showHelp({ tab: 'combos', levels: run.comboLevels, found, sheet });
}

/**
 * Окно настроек — «Пульт» (RD.8, выбор Дениса): строки по группам (Звук · Игра · Вид · Прочее),
 * подпись слева, спокойное управление справа — латунный тумблер, ползунок, ступени скорости,
 * выбор из двух. Золото — только у выбранного. На ПК и в ландшафте — две колонки без прокрутки.
 * Изменения применяются сразу.
 */
export function showSettings(app: App, onChange?: () => void): void {
  const s = { ...app.settings };
  const c = dict().settings;
  const apply = () => {
    app.applySettings({ ...s });
    onChange?.();
  };
  let seq = 0;
  /** Строка: подпись (и пояснение) слева, управление справа; подпись связана с управлением. */
  const row = (title: string, sub: string | null, control: HTMLElement) => {
    const id = `st-${++seq}`;
    // Подпись — самому полю ввода (ползунок в обёртке иначе читается без названия)
    (control.querySelector('input') ?? control).setAttribute('aria-labelledby', id);
    return h('div.st-row', null, [h('span.st-lbl', null, [h('b', { id }, title), sub ? h('small', null, sub) : null]), control]);
  };
  const toggle = (on: boolean, set: (v: boolean) => void) => {
    const b = h(`button.st-tg${on ? '.on' : ''}`, { type: 'button', attrs: { role: 'switch', 'aria-checked': String(on) } });
    b.addEventListener('click', () => {
      const v = !b.classList.contains('on');
      b.classList.toggle('on', v);
      b.setAttribute('aria-checked', String(v));
      app.svc.audio.click();
      set(v);
      apply();
    });
    return b;
  };
  const choice = <T,>(options: { value: T; label: string }[], current: T, set: (v: T) => void) => {
    const wrap = h('span.st-seg', { attrs: { role: 'group' } });
    for (const o of options) {
      const b = h(`button${o.value === current ? '.on' : ''}`, { type: 'button', attrs: { 'aria-pressed': String(o.value === current) } }, o.label);
      b.addEventListener('click', () => {
        if (b.classList.contains('on')) return;
        wrap.querySelectorAll('button').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        app.svc.audio.click();
        set(o.value);
        apply();
      });
      wrap.append(b);
    }
    return wrap;
  };
  const slider = (value: number, set: (v: number) => void) => {
    const pct = Math.round(value * 100);
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(pct) }) as HTMLInputElement;
    const out = h('output', null, `${pct}%`);
    input.style.setProperty('--p', `${pct}%`);
    input.addEventListener('input', () => {
      input.style.setProperty('--p', `${input.value}%`);
      out.textContent = `${input.value}%`;
      set(Number(input.value) / 100);
      apply();
    });
    return h('span.st-sl', null, [input, out]);
  };
  /** Скорость — четыре ступени и название выбранной. */
  const speed = () => {
    const name = h('b', null, c.speeds[s.speed] ?? '');
    const dots = h('span.st-dots', { attrs: { role: 'radiogroup' } });
    const paint = () => dots.querySelectorAll<HTMLElement>('button').forEach((d, i) => {
      d.classList.toggle('on', i === s.speed);
      d.classList.toggle('lit', i < s.speed);
      d.setAttribute('aria-checked', String(i === s.speed));
    });
    SPEEDS.forEach((_, i) => {
      const d = h('button', { type: 'button', attrs: { role: 'radio', 'aria-label': c.speeds[i] ?? '' } });
      d.addEventListener('click', () => {
        s.speed = i;
        name.textContent = c.speeds[i] ?? '';
        paint();
        app.svc.audio.click();
        apply();
      });
      dots.append(d);
    });
    paint();
    return h('span.st-speed', null, [dots, name]);
  };
  const link = (title: string, sub: string | null, run: () => void, danger = false) => {
    const b = h(`button.st-row.st-link${danger ? '.danger' : ''}`, { type: 'button' }, [h('span.st-lbl', null, [h('b', null, title), sub ? h('small', null, sub) : null]), icon('chevron')]);
    b.addEventListener('click', () => {
      app.svc.audio.click();
      run();
    });
    return b;
  };
  const group = (title: string, rows: (HTMLElement | null)[]) => h('section.st-group', null, [h('h3.st-section', null, title), h('div.st-rows', null, rows)]);
  const langNames: Record<Lang, string> = { ru: 'Русский', en: 'English' };
  const onOff = (on: boolean, set: (v: boolean) => void) => toggle(on, set);
  const sound = group(c.groups.sound!, [
    row(c.sfx, null, slider(s.sfx, (v) => (s.sfx = v))),
    row(c.music, null, slider(s.music, (v) => (s.music = v))),
    Haptics.supported() ? row(c.haptics, c.hapticsSub, onOff(s.haptics, (v) => {
      s.haptics = v;
      if (v) app.svc.haptics.play('success');
    })) : null,
  ]);
  const game = group(c.groups.game!, [
    row(c.speed, null, speed()),
    row(c.language, null, choice(LANGS.map((l) => ({ value: l, label: langNames[l] })), getLang(), (v) => {
      // Язык меняет все подписи — окно открывается заново уже на нём
      s.lang = v;
      app.applySettings({ ...s });
      m.close();
      onChange?.();
      showSettings(app, onChange);
    })),
  ]);
  const look = group(c.groups.look!, [
    row(c.reduceMotion, c.reduceMotionSub, onOff(s.reduceMotion, (v) => (s.reduceMotion = v))),
    row(c.largeText, null, choice([{ value: false, label: c.textNormal }, { value: true, label: c.textLarge }], s.largeText, (v) => (s.largeText = v))),
    row(c.quality, t('settings.qualityShort', { now: Math.round(app.svc.renderer.dpr * 10) / 10, max: Math.round(Math.min(3, window.devicePixelRatio || 1) * 10) / 10 }), choice([{ value: 'auto' as const, label: c.qualityAuto }, { value: 'max' as const, label: c.qualityMax }], s.quality, (v) => (s.quality = v))),
    app.platform.id === 'web' && canFullscreen() ? row(c.fullscreen, null, onOff(s.fullscreen, (v) => {
      s.fullscreen = v;
      if (v) enterFullscreen();
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    })) : null,
  ]);
  const other = group(c.groups.other!, [
    link(c.privacy, null, () => void import('./legal').then(({ showLegal }) => showLegal('privacy'))),
    link(c.terms, null, () => void import('./legal').then(({ showLegal }) => showLegal('terms'))),
    link(c.reset, c.resetSub, () => confirmDialog(c.resetConfirm, () => {
      m.close();
      app.runs.resetProgress();
    }), true),
  ]);
  const ver = h('p.st-ver', null, `${t('game.title')} · v${__APP_VERSION__}`);
  const m = modal(h('div.st-body', null, [h('div.st-col', null, [sound, game]), h('div.st-col', null, [look, other, ver])]), {
    title: c.title,
    className: 'settings-modal',
  });
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
        button(t('guide.button'), () => showHelp({ levels: app.run?.comboLevels, found: app.profile.combosFound, profile: app.profile }), { variant: 'secondary' }),
        button(t('settings.title'), () => showSettings(app), { variant: 'secondary' }),
        button(t('pause.toMenu'), () => {
          m.close();
          app.runs.save();
          void app.router.goMenu();
        }, { variant: 'secondary' }),
        button(t('pause.abandon'), () => confirmDialog(t('pause.abandonConfirm'), () => {
          m.close();
          app.runs.abandonRun();
        }, 'danger', { yes: t('pause.abandon'), no: t('pause.keepPlaying') }), { variant: 'ghost' }),
      ]),
    ],
    { title: t('pause.title'), className: 'narrow' },
  );
}
