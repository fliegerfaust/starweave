import type { App, Screen } from '@/game/app';
import { dict, num, t } from '@/i18n';
import { archiveDates, dailyNumber, todayKey } from '@/meta/profile';
import { h } from '../dom';
import { button, confirmDialog } from '../widgets';

/**
 * Архив вызовов дня — календарь прошедших дней. Сыгранные дни светятся (цифра — до какого
 * созвездия дошёл), пройденные целиком отмечены звездой. Играть можно с атласом.
 */
export class ArchiveScreen implements Screen {
  private el!: HTMLElement;
  private selected: string | null;

  constructor(private readonly app: App) {
    this.selected = archiveDates()[0] ?? null;
  }

  mount(root: HTMLElement): void {
    this.el = h('div.archive');
    root.append(this.el);
    this.render();
  }

  unmount(): void {
    this.el.remove();
  }

  private render(): void {
    const scroll = this.el.querySelector('.archive-months')?.scrollTop ?? 0;
    const dates = archiveDates();
    const months = h('div.archive-months');
    // Месяцы от свежего к первому
    const keys = [...new Set([todayKey().slice(0, 7), ...dates.map((d) => d.slice(0, 7))])];
    for (const key of keys) months.append(this.month(key, new Set(dates)));
    this.el.replaceChildren(
      h('div.atlas-top', null, [button(`‹ ${t('menu.back')}`, () => void this.app.goMenu(), { variant: 'ghost', className: 'small' })]),
      h('header.archive-head', null, [h('h1.atlas-title', null, t('archive.title')), h('p.atlas-lede', null, dates.length ? t('archive.lede') : t('archive.empty'))]),
      months,
      ...[this.detail()].filter((x): x is HTMLElement => !!x),
    );
    const m = this.el.querySelector('.archive-months');
    if (m) m.scrollTop = scroll;
  }

  private month(key: string, playable: Set<string>): HTMLElement {
    const [y, m] = key.split('-').map(Number) as [number, number];
    const first = new Date(Date.UTC(y, m - 1, 1));
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Неделя с понедельника
    const offset = (first.getUTCDay() + 6) % 7;
    const grid = h('div.archive-grid', { attrs: { role: 'grid' } });
    for (const wd of dict().archive.weekdays) grid.append(h('span.archive-wd', null, wd));
    for (let i = 0; i < offset; i++) grid.append(h('span.archive-pad', null));
    const results = this.app.profile.archive ?? {};
    const today = todayKey();
    for (let d = 1; d <= days; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`;
      const r = results[date];
      if (date === today) {
        grid.append(h('span.archive-day.today', { attrs: { 'aria-label': t('archive.today') } }, [h('b', null, String(d)), h('small', null, t('archive.today'))]));
        continue;
      }
      if (!playable.has(date)) {
        grid.append(h('span.archive-day.out', null, h('b', null, String(d))));
        continue;
      }
      const cell = h(`button.archive-day${r ? '.played' : ''}${r?.won ? '.won' : ''}${date === this.selected ? '.on' : ''}`, {
        type: 'button',
        attrs: { 'aria-pressed': String(date === this.selected), 'aria-label': `${t('archive.day', { n: dailyNumber(date) })}` },
      }, [h('b', null, String(d)), h('small', null, r ? (r.won ? '✦' : `${r.ante}`) : '')]);
      cell.addEventListener('click', () => {
        this.selected = date;
        this.app.svc.audio.click();
        this.render();
      });
      grid.append(cell);
    }
    return h('section.archive-month', null, [h('h2.archive-month-name', null, `${dict().archive.months[m - 1]} ${y}`), grid]);
  }

  private detail(): HTMLElement | null {
    const date = this.selected;
    if (!date) return null;
    const r = this.app.profile.archive?.[date];
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const owned = this.app.purchases.has('atlas');
    const result = r ? t('archive.best', { ante: r.ante, best: num(r.best) }) : t('archive.notPlayed');
    return h('div.archive-detail', null, [
      h('div.archive-detail-head', null, [
        h('span.archive-detail-n', null, t('archive.day', { n: dailyNumber(date) })),
        h('span.archive-detail-date', null, t('archive.date', { d, month: dict().archive.monthsOf[m - 1]!, y })),
      ]),
      h('p.archive-detail-result', null, r?.won ? `${result} · ${t('archive.won')}` : result),
      owned
        ? button(r ? t('archive.replay') : t('archive.play'), () => this.play(date), { className: 'archive-play' })
        : h('div.archive-locked', null, [
            h('p', null, t('archive.locked')),
            button(t('archive.toAtlas'), () => void this.app.goAtlas('archive', 'archive'), { className: 'archive-play' }),
          ]),
    ]);
  }

  private play(date: string): void {
    const start = () => this.app.startArchive(date);
    if (this.app.hasSave) confirmDialog(t('menu.overwrite'), start, 'primary');
    else start();
  }
}
