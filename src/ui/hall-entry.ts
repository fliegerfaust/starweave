import { featSigil } from '@/art/sigil';
import { dict, format, getLang } from '@/i18n';
import { featStates, percentileOf, RECORDS, recordValue, type FeatState } from '@/meta/achievements';
import { cachedHallStats, hallView } from '@/meta/hall-sync';
import type { Profile } from '@/meta/profile';
import { canvasImg, dpr, h } from './dom';
import { icon } from './icons';

/*
 * Вход в «Зал славы» с главной (HF.6, выбор Дениса — «строка гордости вместо слогана»):
 * под названием медаль и одна фраза с числом цветом, «Ты лучше, чем 74% игроков».
 * Новое достижение, которое игрок ещё не видел в зале, светится на входе.
 */

const SEEN_KEY = 'starweave.hallseen.v1';

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

function readSeen(done: number): number {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw != null) return Number(raw);
    // Первый показ входа: всё открытое до него считаем увиденным, светится только новое
    localStorage.setItem(SEEN_KEY, String(done));
  } catch { /* без хранилища новое не подсвечиваем */ }
  return done;
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
  const force = import.meta.env.DEV && new URLSearchParams(location.search).has('fresh');
  return { done: done.length, total: states.length, medals, hook, fresh: force || done.length > readSeen(done.length) };
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

/** Строка гордости: медаль и одна фраза с числом цветом; нечем гордиться — счёт достижений. */
export function hallPride(p: Profile, open: () => void): HTMLElement {
  const t = hallTeaser(p);
  const d = dict().hall;
  const [a, b] = (t.hook?.tpl ?? '').split('{p}');
  const line = t.hook
    ? h('span.hall-entry-hook', null, [a ?? '', h('b', null, t.hook.p), b ?? ''])
    : h('span.hall-entry-hook', null, format(d.entryCount, { n: t.done, total: t.total }));
  const btn = h(`button.hall-pride${t.fresh ? '.is-new' : ''}`, { type: 'button', attrs: { 'aria-label': `${d.title}. ${line.textContent ?? ''}${t.fresh ? `. ${d.entryNew}` : ''}` } }, [
    h('span.hall-pride-medal', null, medal(t.medals[0], 26)),
    h('span.hall-pride-line', null, [line, icon('chevron')]),
  ]);
  btn.addEventListener('click', open);
  return btn;
}
