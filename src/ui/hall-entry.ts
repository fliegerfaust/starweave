import { featSigil } from '@/art/sigil';
import { dict, format, getLang } from '@/i18n';
import { featStates, percentileOf, RECORDS, recordValue, type FeatState } from '@/meta/achievements';
import { cachedHallStats, hallView } from '@/meta/hall-sync';
import type { Profile } from '@/meta/profile';
import { canvasImg, dpr, h } from './dom';
import { icon } from './icons';

/*
 * Вход в «Зал славы» с главной (HF.6). Три варианта для витрины, выбор Дениса — в `?hallv=a|b|c`:
 *  a — «Две полки»: полка находок делится на Коллекцию и Зал славы;
 *  b — «Пульт»: лёгкая кнопка рядом с вызовом дня, знак — твоя самая редкая медаль;
 *  c — «Строка гордости»: под названием медаль и «Ты лучше, чем 74% игроков».
 * Новое достижение, которое игрок ещё не видел в зале, светится на входе.
 */

const SEEN_KEY = 'starweave.hallseen.v1';

export type HallEntryKind = 'a' | 'b' | 'c';

function pct(p: number): string {
  const v = p < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  return `${v.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US')}%`;
}

export interface HallTeaser {
  done: number;
  total: number;
  /** Открытые, самые редкие первыми. */
  medals: FeatState[];
  /** Чем гордиться одной фразой: место в рекорде или редкость награды. */
  hook: { tpl: string; p: string } | null;
  fresh: boolean;
}

export function hallTeaser(p: Profile): HallTeaser {
  const d = dict().hall;
  const stats = hallView(cachedHallStats());
  const states = featStates(p);
  const share = (s: FeatState) => stats.feats[s.def.id] ?? 100;
  const done = states.filter((s) => s.done);
  const medals = [...done].sort((a, b) => share(a) - share(b));
  const best = Math.max(-1, ...RECORDS.map((id) => percentileOf(stats.records[id], recordValue(p, id)) ?? -1));
  const rare = medals[0] && share(medals[0]) <= 25 ? share(medals[0]) : null;
  // Место среди игроков звучит сильнее, но только когда оно хорошее; иначе — редкость медали
  const hook = best >= 50 ? { tpl: d.better, p: `${best}%` } : rare != null ? { tpl: d.entryRare, p: pct(rare) } : null;
  let seen = done.length;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    seen = raw == null ? done.length : Number(raw);
  } catch { /* без хранилища новое не подсвечиваем */ }
  const force = import.meta.env.DEV && new URLSearchParams(location.search).has('fresh');
  return { done: done.length, total: states.length, medals, hook, fresh: force || done.length > seen };
}

/** Зал открыт: всё открытое увидено, свечение на входе гаснет. */
export function markHallSeen(p: Profile): void {
  try {
    localStorage.setItem(SEEN_KEY, String(featStates(p).filter((s) => s.done).length));
  } catch { /* не страшно */ }
}

function medal(s: FeatState | undefined, size: number): HTMLElement {
  return s ? canvasImg(featSigil(s.def.motif, s.def.fam, s.def.tier, size, dpr()), size) : h('span.hall-entry-empty', { style: `width:${size}px;height:${size}px` }, icon('hall'));
}

function hookLine(hook: HallTeaser['hook']): HTMLElement | null {
  if (!hook) return null;
  const [a, b] = hook.tpl.split('{p}');
  return h('span.hall-entry-hook', null, [a ?? '', h('b', null, hook.p), b ?? '']);
}

/** a — правая половина полки: три медали и счёт, подпись разделом сверху. */
export function hallShelfCell(p: Profile, open: () => void): HTMLElement {
  const t = hallTeaser(p);
  const d = dict().hall;
  const marks = t.medals.slice(0, 3).map((s, i) => h(`span.shelf-mark${i === 0 && t.fresh ? '.fresh' : ''}`, null, medal(s, 26)));
  const b = h(`button.menu-shelf.shelf-cell.hall-cell${t.fresh ? '.is-new' : ''}`, { type: 'button', attrs: { 'aria-label': `${d.title}: ${format(d.of, { n: t.done, total: t.total })}` } }, [
    h('span.shelf-label', null, d.title),
    h('span.shelf-top', null, [
      marks.length ? h('span.shelf-marks', { attrs: { 'aria-hidden': 'true' } }, marks) : null,
      h('span.shelf-text', null, [format(d.of, { n: t.done, total: t.total }), icon('chevron')]),
    ]),
    h('span.shelf-bar', { style: `--p: ${Math.round((t.done / t.total) * 100)}%`, attrs: { 'aria-hidden': 'true' } }),
  ]);
  b.addEventListener('click', open);
  return b;
}

/** b — лёгкая кнопка пульта: знак — самая редкая медаль игрока. */
export function hallLite(p: Profile, open: () => void): HTMLElement {
  const t = hallTeaser(p);
  const b = h(`button.menu-lite.hall-lite${t.fresh ? '.is-new' : ''}`, { type: 'button' }, [h('span.hall-lite-medal', null, medal(t.medals[0], 24)), dict().hall.menu]);
  b.addEventListener('click', open);
  return b;
}

/** c — строка гордости под названием: медаль, имя зала и одна фраза с числом. */
export function hallPride(p: Profile, open: () => void): HTMLElement {
  const t = hallTeaser(p);
  const d = dict().hall;
  const hook = hookLine(t.hook) ?? h('span.hall-entry-hook', null, format(d.opened, { n: t.done, total: t.total }));
  const b = h(`button.hall-pride${t.fresh ? '.is-new' : ''}`, { type: 'button' }, [
    h('span.hall-pride-medal', null, medal(t.medals[0], 34)),
    h('span.hall-pride-text', null, [h('span.hall-pride-label', null, [d.title, t.fresh ? h('i.hall-new-dot', { attrs: { 'aria-label': d.entryNew } }) : null]), h('span.hall-pride-line', null, [hook, icon('chevron')])]),
  ]);
  b.addEventListener('click', open);
  return b;
}
