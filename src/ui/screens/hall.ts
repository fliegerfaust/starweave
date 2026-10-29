import { track } from '@/analytics';
import { featSigil } from '@/art/sigil';
import { dict, format, getLang, num } from '@/i18n';
import { featStates, nearestFeat, percentileOf, RECORDS, recordValue, type FeatState, type FeatTier, type HallStats, type RecordId } from '@/meta/achievements';
import { hallView } from '@/meta/hall-sync';
import type { Profile } from '@/meta/profile';
import { canvasImg, dpr, h } from '../dom';
import { PlayerSky } from '../hall-sky';
import { modal } from '../widgets';

/*
 * «Зал славы» (HF, вариант «Горизонт», выбор Дениса): сверху доска — небо игроков, ниже
 * рекорды и достижения строками. Касание рекорда или достижения меняет доску: рекорд —
 * сколько игроков ты обошёл, достижение — у скольких игроков оно есть и среди них ли ты.
 * Доска одной высоты в обоих видах — ничего не скачет. Окно и раскладка — общие с
 * Коллекцией (`board-modal`): на ПК и в ландшафте доска слева во всю высоту.
 */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Доля игроков: меньше 10% — с десятыми, как в Steam. */
function pct(p: number): string {
  const v = p < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  return `${v.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US')}%`;
}

function medal(s: FeatState, size: number): HTMLCanvasElement {
  const el = s.secret ? canvasImg(featSigil('', 'silver', 0, size, dpr()), size) : canvasImg(featSigil(s.def.motif, s.def.fam, s.def.tier, size, dpr()), size);
  if (!s.done) el.classList.add('unknown');
  return el;
}

type Pick = { kind: 'record'; id: RecordId } | { kind: 'feat'; state: FeatState };

export function showHall(profile: Profile, raw: HallStats | null): void {
  const d = dict().hall;
  // Доли достижений есть всегда (сглаженные), места в рекордах — когда сервер ответил
  const stats = hallView(raw);
  const noShare = d.offline;
  const states = featStates(profile);
  const doneCount = states.filter((s) => s.done).length;
  const nearest = nearestFeat(states);
  const share = (s: FeatState): number | null => (s.secret ? null : stats?.feats[s.def.id] ?? null);
  // Самая редкая из открытых — чем гордиться
  // Показываем, только если правда редкая: «самая редкая» у половины игроков звучит фальшиво
  const rarest = states.filter((s) => s.done && share(s) != null && share(s)! <= 25).sort((a, b) => share(a)! - share(b)!)[0] ?? null;
  const featName = (s: FeatState) => (s.secret ? d.secretName : d.feat[s.def.id]![0]);
  const featDesc = (s: FeatState) => (s.secret ? d.secretDesc : d.feat[s.def.id]![1]);
  const better = (id: RecordId): number | null => percentileOf(stats?.records[id], recordValue(profile, id));
  const recordText = (id: RecordId): string => {
    const v = recordValue(profile, id);
    if (id === 'bestAnte') return v ? format(d.chapter, { n: ROMAN[v - 1] ?? v }) : '0';
    if (id === 'streak') return `${num(v)} ${d.days}`;
    return num(v);
  };
  const section = (title: string, sub: string | null) => h('h3.gb-section', null, [title, sub ? h('small', null, sub) : null]);
  /** Строка с числом процента внутри: число цветом, остальное тихо. */
  const withNum = (tpl: string, value: string) => {
    const [a, b] = tpl.split('{p}');
    const n = h('b', { attrs: { 'aria-hidden': 'true' } }, value);
    return { el: h('span', null, [a ?? '', n, b ?? '']), n };
  };

  // ─── Доска ───────────────────────────────────────────────────────────────
  const sky = new PlayerSky();
  const head = h('div.hall-head');
  const cap = h('div.hall-cap');
  // Для скринридера — итог одной фразой: набегающее число на каждом кадре не озвучиваем
  const said = h('span.sr-only', { attrs: { 'aria-live': 'polite' } });
  const board = h('div.gb-board.hall-sky', null, [head, sky.el, cap, said]);
  let countEl: HTMLElement | null = null;
  let countFmt = (v: number) => `${Math.round(v)}%`;
  sky.onCount((v) => countEl && (countEl.textContent = countFmt(v)));
  let flareTimer = 0;
  let pick: Pick = { kind: 'record', id: 'bestMove' };

  const drawBoard = () => {
    window.clearTimeout(flareTimer);
    board.classList.remove('flare');
    if (pick.kind === 'record') {
      const id = pick.id;
      const p = better(id);
      head.className = 'hall-head rec';
      head.replaceChildren(h('h3', null, d.record[id]), h('b.hall-value', null, recordText(id)));
      if (p == null) {
        countEl = null;
        // Нет числа: либо ещё нечего сравнивать, либо нет связи с сервером
        cap.replaceChildren(h('span.hall-cap-line.off', null, stats && !recordValue(profile, id) ? d.noRecord : noShare));
      } else if (p === 0) {
        // Наравне с самыми первыми (глава I у всех): «лучше 0%» звучит обидно, зовём дальше
        countEl = null;
        cap.replaceChildren(h('span.hall-cap-line.off', null, d.firstStep));
      } else {
        const line = withNum(d.better, '0%');
        countEl = line.n;
        countFmt = (v) => `${Math.round(v)}%`;
        cap.replaceChildren(h('span.hall-cap-line', null, line.el));
      }
      sky.set({ kind: 'record', percent: p });
      if (p) flareTimer = window.setTimeout(() => board.classList.add('flare'), 900);
    } else {
      const s = pick.state;
      const p = share(s);
      const tier = s.secret ? null : s.def.tier;
      head.className = 'hall-head feat';
      head.replaceChildren(
        h('span.hall-medal', null, medal(s, 64)),
        h('span.hall-headtext', null, [
          h('h3', null, featName(s)),
          h('p', null, featDesc(s)),
          tier != null ? h(`span.hall-tierline.t${tier}`, null, d.tiers[tier]) : null,
        ]),
      );
      const parts: HTMLElement[] = [];
      if (p != null) {
        const line = withNum(s.done ? d.haveMine : d.have, pct(0));
        countEl = line.n;
        countFmt = (v) => pct(v);
        parts.push(h('span.hall-cap-line', null, line.el));
      } else {
        countEl = null;
        parts.push(h('span.hall-cap-line.off', null, s.secret ? d.secretShare : noShare));
      }
      if (!s.done && !s.secret && s.goal > 1) {
        parts.push(h('span.hall-prog', null, [
          h('span.shelf-bar', { style: `--p: ${Math.round((s.value / s.goal) * 100)}%`, attrs: { 'aria-hidden': 'true' } }),
          h('span', null, format(d.of, { n: num(s.value), total: num(s.goal) })),
        ]));
      }
      cap.replaceChildren(...parts);
      sky.set({ kind: 'feat', percent: p, mine: s.done, seed: states.indexOf(s) + 1 });
      if (s.done && p != null) flareTimer = window.setTimeout(() => board.classList.add('flare'), 900);
    }
    syncRows();
    said.textContent = [head.textContent, cap.textContent].filter(Boolean).join('. ');
  };

  // ─── Строки ──────────────────────────────────────────────────────────────
  const rows: { el: HTMLElement; is: (p: Pick) => boolean }[] = [];
  const syncRows = () => rows.forEach((r) => {
    const on = r.is(pick);
    r.el.classList.toggle('on', on);
    r.el.setAttribute('aria-pressed', String(on));
  });
  const choose = (p: Pick) => {
    pick = p;
    drawBoard();
  };
  const recordRow = (id: RecordId) => {
    const p = better(id);
    const b = h('button.hall-row.rec', { type: 'button' }, [
      h('span.hall-row-text', null, [h('b', null, d.record[id])]),
      h('span.hall-row-side', null, [h('em', null, recordText(id)), p ? h('small', null, format(d.betterShort, { p: `${p}%` })) : null]),
    ]);
    b.addEventListener('click', () => choose({ kind: 'record', id }));
    rows.push({ el: b, is: (x) => x.kind === 'record' && x.id === id });
    return b;
  };
  const featRow = (s: FeatState) => {
    const p = share(s);
    const b = h(`button.hall-row.feat${s.done ? '.done' : ''}`, { type: 'button' }, [
      medal(s, 44),
      h('span.hall-row-text', null, [
        h('b', null, featName(s)),
        h('small', null, !s.done && !s.secret && s.goal > 1 ? `${featDesc(s)} · ${format(d.of, { n: num(s.value), total: num(s.goal) })}` : featDesc(s)),
      ]),
      h('span.hall-row-side', null, p != null ? [h('em', null, pct(p)), h('small', null, d.players)] : []),
    ]);
    b.addEventListener('click', () => choose({ kind: 'feat', state: s }));
    rows.push({ el: b, is: (x) => x.kind === 'feat' && x.state === s });
    return b;
  };

  const records = () => h('div.coll-block.hall-records', null, [section(d.records, null), h('div.hall-rows', null, RECORDS.map(recordRow))]);
  const tiers: FeatTier[] = [3, 2, 1, 0];
  const pin = h('div.gb-pin', null, [board, records()]);
  const scroll = h('div.gb-scroll', null, [
    records(),
    section(d.feats, format(d.opened, { n: doneCount, total: states.length })),
    stats ? h('p.hall-legend', null, d.legend) : null,
    rarest ? h('div.hall-spot', null, [h('span.hall-group', null, d.rarest), featRow(rarest)]) : null,
    nearest ? h('div.hall-spot', null, [h('span.hall-group', null, d.nearest), featRow(nearest)]) : null,
    ...tiers.flatMap((tier) => {
      const list = states.filter((s) => s.def.tier === tier).sort((a, b) => Number(b.done) - Number(a.done));
      return [h('span.hall-group', null, d.tierHead[tier]), h('div.hall-feats', null, list.map(featRow))];
    }),
  ].filter((x): x is HTMLElement => !!x));

  const body = h('div.gb', null, [pin, scroll]);
  track('hall_open', { feats: doneCount, shares: !!raw });
  modal(body, { title: d.title, className: 'board-modal collection-modal hall-modal' });
  // Небо меряется по уже вставленной доске
  requestAnimationFrame(drawBoard);
}
