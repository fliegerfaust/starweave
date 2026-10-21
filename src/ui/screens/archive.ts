import { bossSigil } from '@/art/sigil';
import { newRun } from '@/core/run';
import type { App, Screen } from '@/game/app';
import { dict, format, named, num, t } from '@/i18n';
import { archiveDates, dailyNumber, dailySeed, dailyTaken, todayKey, type ArchiveRecord } from '@/meta/profile';
import { canvasImg, dpr, h } from '../dom';
import { icon } from '../icons';
import { button } from '../widgets';
import { confirmNewRun } from './common';

/*
 * «Журнал наблюдений» (RD.6, выбор Дениса): дни строками от свежего — крупный номер вызова,
 * дата и знак Затмения главы I (по сиду дня — этим дни правда отличаются), восемь делений
 * глав и лучший ход. Сегодняшний вызов — первым, его играют все. Без атласа своя история
 * видна целиком, а «Сыграть» прошлый день мягко ведёт в атлас. На телефоне выбранная строка
 * раскрывается описанием Затмения; на ПК и в ландшафте справа — панель дня и сводка месяца.
 */

/** Затмение главы I вызова — из сида дня; считается один раз. */
const firstBoss = new Map<string, string>();
function bossOf(date: string): string {
  let id = firstBoss.get(date);
  if (!id) {
    id = newRun({ seed: dailySeed(date), daily: true, dailyDate: date }).bosses[0]!;
    firstBoss.set(date, id);
  }
  return id;
}

/** Первое предложение описания — для строки; целиком — в панели дня. */
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0]!.replace(/\.$/, '');

/** Звезда Telegram — нарисованный знак цены. */
function tstar(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tstar');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m12 2.8 2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.8l-5.7 3.2 1.4-6.3-4.8-4.3 6.4-.7Z"/>';
  return svg;
}

export class ArchiveScreen implements Screen {
  private el!: HTMLElement;
  private selected: string;
  private prices: Record<string, string> | null = null;
  private shown = false;

  constructor(private readonly app: App) {
    // По умолчанию — вчерашний вызов: сегодняшний и так на главной
    this.selected = archiveDates()[0] ?? todayKey();
  }

  mount(root: HTMLElement): void {
    this.el = h('div.archive');
    root.append(this.el);
    this.render();
    if (!this.owned) {
      void this.app.platform.payments?.prices().then((p) => {
        this.prices = p;
        this.render();
      }).catch(() => undefined);
    }
  }

  unmount(): void {
    this.el.remove();
  }

  private get owned(): boolean {
    return this.app.purchases.has('atlas');
  }

  private rec(date: string): ArchiveRecord | undefined {
    return this.app.profile.archive?.[date];
  }

  private render(): void {
    // Касание строки пересобирает экран — прокрутка журнала остаётся на месте
    const keep = this.shown ? [...this.el.querySelectorAll<HTMLElement>('.arc-body, .arc-log')].map((e) => e.scrollTop) : [];
    const today = todayKey();
    const days = [today, ...archiveDates()];
    // Журнал по месяцам, от свежего
    const log = h('div.arc-log');
    let month = '';
    for (const date of days) {
      if (date.slice(0, 7) !== month) {
        month = date.slice(0, 7);
        const m = Number(month.slice(5)) - 1;
        log.append(h('h2.arc-section', null, [dict().archive.months[m]!, month === today.slice(0, 7) ? h('small', null, t('archive.fresh')) : null]));
      }
      log.append(this.row(date, date === today));
    }
    this.el.replaceChildren(
      h('header.arc-top', null, [
        h('button.arc-back', { type: 'button', onclick: () => void this.app.goMenu() }, [icon('back'), t('menu.back')]),
        h('h1.arc-plaque', null, t('archive.title')),
        h('span'),
      ]),
      h('div.arc-body', null, [log, h('div.arc-side', null, [this.day(), this.summary()])]),
      this.cta(),
    );
    [...this.el.querySelectorAll<HTMLElement>('.arc-body, .arc-log')].forEach((e, i) => {
      if (keep[i] !== undefined) e.scrollTop = keep[i]!;
    });
    this.shown = true;
  }

  /** Строка дня: номер, дата и Затмение, восемь глав, лучший ход. */
  private row(date: string, isToday: boolean): HTMLElement {
    const r = this.rec(date);
    const n = dailyNumber(date);
    const d = Number(date.slice(8));
    const m = Number(date.slice(5, 7)) - 1;
    const wd = dict().archive.weekdays[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
    const boss = bossOf(date);
    const { name, desc } = named('boss', boss);
    const on = date === this.selected;
    const best = isToday && !r ? h('span.arc-best.none', null, t('archive.today'))
      : r ? h(`span.arc-best${r.won ? '.won' : ''}`, null, [r.won ? icon('check', 'icon arc-won') : '', num(r.best), h('small', null, t('archive.bestMove'))])
      : h('span.arc-best.none', null, '—');
    const row = h(`button.arc-row${isToday ? '.today' : ''}${on ? '.on' : ''}`, {
      type: 'button',
      attrs: {
        'aria-pressed': String(on),
        'aria-label': [isToday ? t('archive.today') : t('archive.dayLabel', { date: this.dateText(date), n }), r ? (r.won ? t('archive.won') : t('archive.dayResult', { ante: r.ante })) : t('archive.notPlayed')].join(', '),
      },
    }, [
      h('span.arc-n', null, [h('b', null, String(n)), h('small', null, wd)]),
      h('span.arc-meta', null, [canvasImg(bossSigil(boss, 18, dpr()), 18), `${d} ${dict().archive.monthsShort[m]}`, h('span', null, `· ${name}`)]),
      best,
      this.chapters(r, isToday && !r),
      // Телефон: у выбранной строки — что за Затмение (на ПК это в панели справа)
      on ? h('span.arc-more', null, [h('b', null, `${t('archive.eclipseOf')}: `), firstSentence(desc)]) : null,
    ]);
    row.addEventListener('click', (e) => {
      if (this.selected === date) return;
      this.selected = date;
      this.app.svc.audio.click();
      this.render();
      // С клавиатуры строка пересоздана — возвращаем на неё фокус (касанию рамка фокуса не нужна)
      if (e.detail === 0) this.el.querySelector<HTMLElement>('.arc-row.on')?.focus({ preventScroll: true });
    });
    return row;
  }

  private chapters(r: ArchiveRecord | undefined, dim = false): HTMLElement {
    const bar = h(`span.arc-chapters${r?.won ? '.won' : ''}${dim ? '.dim' : ''}`, { attrs: { 'aria-hidden': 'true' } });
    for (let i = 0; i < 8; i++) bar.append(h(`i${r && i < r.ante ? '.lit' : ''}`));
    return bar;
  }

  /** Панель выбранного дня (ПК и ландшафт): вызов, дата, итог, главы, Затмение главы I. */
  private day(): HTMLElement {
    const date = this.selected;
    const r = this.rec(date);
    const isToday = date === todayKey();
    const boss = bossOf(date);
    const { name, desc } = named('boss', boss);
    const res = r?.won ? h('p.arc-res.won', null, format(t('archive.wonLine'), { best: num(r.best) }))
      : r ? h('p.arc-res', null, format(t('archive.reached'), { ante: r.ante, best: num(r.best) }))
      : h('p.arc-res.none', null, isToday ? t('archive.todayLine') : t('archive.notPlayed'));
    return h('section.arc-day', null, [
      h('div.arc-day-head', null, [h('h2.arc-day-n', null, t('archive.day', { n: dailyNumber(date) })), h('span.arc-date', null, isToday ? t('archive.today') : this.dateText(date))]),
      res,
      this.chapters(r),
      h('div.arc-eclipse', null, [canvasImg(bossSigil(boss, 48, dpr()), 48), h('small', null, t('archive.eclipseOf')), h('span', null, [h('b', null, `${name}. `), desc])]),
    ]);
  }

  /** Сводка месяца выбранного дня — по итогам игрока. */
  private summary(): HTMLElement {
    const month = this.selected.slice(0, 7);
    const days = [todayKey(), ...archiveDates()].filter((d) => d.startsWith(month));
    const recs = days.map((d) => this.rec(d)).filter((r): r is ArchiveRecord => !!r);
    const cell = (value: string, label: string, extra?: string) => h('div', null, [h('b', null, [value, extra ? h('small', null, ` / ${extra}`) : null]), h('span', null, label)]);
    return h('div.arc-sum', null, [
      cell(String(recs.length), t('archive.sumPlayed'), String(days.length)),
      cell(String(recs.filter((r) => r.won).length), t('archive.sumWon')),
      cell(recs.length ? num(Math.max(...recs.map((r) => r.best))) : '—', t('archive.sumBest')),
    ]);
  }

  /** Кнопка по выбранному дню: сегодняшний — всем, прошлый — с атласом, иначе мягко в атлас. */
  private cta(): HTMLElement {
    const app = this.app;
    const date = this.selected;
    const foot = h('footer.arc-cta');
    const playLabel = (label: string) => h('span.btn-row', null, [icon('play'), label]);
    if (date === todayKey()) {
      const done = dailyTaken(app.profile) && !(app.run?.daily && !app.run.archive && app.hasSave);
      foot.append(button(done ? t('menu.dailyDone') : playLabel(t('archive.playToday')), () => this.guard(() => app.startRun('classic', true)), { disabled: done, variant: done ? 'secondary' : 'primary' }));
      return foot;
    }
    const r = this.rec(date);
    if (this.owned) {
      foot.append(button(playLabel(r ? t('archive.replay') : t('archive.playN', { n: dailyNumber(date) })), () => this.guard(() => app.startArchive(date))));
      return foot;
    }
    const price = this.prices?.atlas;
    const m = price ? /^(\d+)\s*⭐$/.exec(price.trim()) : null;
    foot.append(
      h('p.arc-note', null, [t('archive.lockedLead'), h('b', null, t('archive.lockedAtlas')), r ? t('archive.lockedOwn') : '.']),
      button(h('span.btn-row', null, [t('archive.toAtlas'), price ? h('span.arc-pr', null, m ? [tstar(), m[1]!] : [price]) : null]), () => void app.goAtlas('archive', 'archive'), { variant: 'secondary' }),
    );
    return foot;
  }

  private dateText(date: string): string {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    return t('archive.date', { d, month: dict().archive.monthsOf[m - 1]!, y });
  }

  /** Сохранённый забег перезапишется — спрашиваем. */
  private guard(start: () => void): void {
    confirmNewRun(this.app, start);
  }
}
