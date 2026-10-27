import { featSigil } from '@/art/sigil';
import { dict, format, getLang, num } from '@/i18n';
import { FEAT_GROUPS, featStates, nearestFeat, percentileOf, RECORDS, recordValue, type FeatState, type FeatTier, type HallStats, type RecordId } from '@/meta/achievements';
import type { Profile } from '@/meta/profile';
import { canvasImg, dpr, h } from '../dom';
import { modal } from '../widgets';

/*
 * «Зал славы» (HF.0, витрина): рекорды игрока, достижения с долей игроков и место среди
 * всех. Два варианта на выбор Денису:
 *  - `order` «Орден»: как Коллекция — выбранное достижение крупно на доске, ниже рекорды
 *    и медальоны по разделам;
 *  - `horizon` «Горизонт»: на доске рекорд и звёздный горизонт — сколько игроков ниже тебя;
 *    достижения строками от легендарных к обычным, у каждого доля игроков.
 * Окно и раскладка — общие с Коллекцией (`board-modal`): на ПК и в ландшафте доска слева.
 */
export type HallVariant = 'order' | 'horizon';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const wide = () => document.body.classList.contains('landscape') && matchMedia('(min-width: 900px) and (min-height: 561px)').matches;

/** Доля игроков: меньше 10% — с десятыми, как в Steam. */
function pct(p: number): string {
  const v = p < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  return v.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US');
}

function medal(s: FeatState, size: number): HTMLCanvasElement {
  const el = s.secret ? canvasImg(featSigil('', 'silver', 0, size, dpr()), size) : canvasImg(featSigil(s.def.motif, s.def.fam, s.def.tier, size, dpr()), size);
  if (!s.done) el.classList.add('unknown');
  return el;
}

export function showHall(profile: Profile, stats: HallStats | null, variant: HallVariant = 'order'): void {
  const d = dict().hall;
  const states = featStates(profile);
  const doneCount = states.filter((s) => s.done).length;
  const nearest = nearestFeat(states);
  const featName = (s: FeatState) => (s.secret ? d.secretName : d.feat[s.def.id]![0]);
  const featDesc = (s: FeatState) => (s.secret ? d.secretDesc : d.feat[s.def.id]![1]);
  const have = (s: FeatState): string | null => {
    const p = stats?.feats[s.def.id];
    if (p == null || s.secret) return null;
    return p < 1 && p > 0 && p < 0.05 ? d.haveFew : format(d.have, { p: pct(p) });
  };
  const better = (id: RecordId): number | null => percentileOf(stats?.records[id], recordValue(profile, id));
  const recordText = (id: RecordId): string => {
    const v = recordValue(profile, id);
    if (id === 'bestAnte') return v ? format(d.chapter, { n: ROMAN[v - 1] ?? v }) : '0';
    if (id === 'streak') return `${num(v)} ${d.days}`;
    return num(v);
  };
  const section = (title: string, sub: string | null) => h('h3.gb-section', null, [title, sub ? h('small', null, sub) : null]);
  /** «лучше, чем у 81% игроков» — число цветом, остальное тихо. */
  const betterLine = (p: number | null) => {
    if (p == null) return null;
    const [a, b] = d.better.split('{p}');
    return h('span.hall-better', null, [a ?? '', h('b', null, `${p}%`), b ?? '']);
  };
  const progressLine = (s: FeatState) => s.done ? h('span.hall-prog.done', null, d.done)
    : s.secret ? null
    : s.goal > 1 ? h('span.hall-prog', null, [
        h('span.shelf-bar', { style: `--p: ${Math.round((s.value / s.goal) * 100)}%`, attrs: { 'aria-hidden': 'true' } }),
        h('span', null, format(d.of, { n: num(s.value), total: num(s.goal) })),
      ])
    : null;
  const tally = () => h('div.coll-progress', null, [
    h('span', null, format(d.opened, { n: doneCount, total: states.length })),
    h('span.shelf-bar', { style: `--p: ${Math.round((doneCount / states.length) * 100)}%`, attrs: { 'aria-hidden': 'true' } }),
  ]);

  const body = h('div.gb');
  const pin = h('div.gb-pin');
  const scroll = h('div.gb-scroll');
  body.append(pin, scroll);

  if (variant === 'order') {
    // ─── «Орден»: доска с выбранным достижением ───────────────────────────
    let pick: FeatState = nearest ?? states.find((s) => s.done) ?? states[0]!;
    const board = h('div.gb-board.hall-plate');
    const drawBoard = () => {
      const size = wide() ? 128 : 72;
      const tier = pick.secret ? null : d.tiers[pick.def.tier];
      const rarity = have(pick);
      board.replaceChildren(
        h('span.hall-big', null, medal(pick, size)),
        h('div.gb-tally', null, [
          h('h3', null, featName(pick)),
          h('p', null, featDesc(pick)),
          h('span.hall-tier', null, [tier ? h('b', { className: `t${pick.def.tier}` }, tier) : null, rarity ? h('span', null, rarity) : null]),
          progressLine(pick) ?? h('span.hall-prog'),
        ]),
      );
    };
    const grid = (list: FeatState[]) => {
      const el = h('div.gb-sigils.hall-sigils');
      for (const s of list) {
        const b = h(`button${s === pick ? '.on' : ''}${s.done ? '' : '.unknown'}`, { type: 'button', attrs: { 'aria-label': featName(s), 'aria-pressed': String(s === pick) } }, medal(s, 46));
        b.addEventListener('click', () => {
          pick = s;
          body.querySelectorAll('.hall-sigils button').forEach((x) => {
            x.classList.toggle('on', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
          drawBoard();
        });
        el.append(b);
      }
      return el;
    };
    const records = () => h('div.coll-block.hall-records', null, [
      section(d.records, null),
      h('div.hall-recs', null, RECORDS.map((id) => h('div.hall-rec', null, [
        h('span', null, [d.record[id], betterLine(better(id))]),
        h('b', null, recordText(id)),
      ]))),
    ]);
    drawBoard();
    pin.append(board, records());
    scroll.append(
      records(),
      section(d.feats, null),
      tally(),
      h('div.hall-groups', null, FEAT_GROUPS.map((g) => h('div.hall-gp', null, [h('span.hall-group', null, d.groups[g]), grid(states.filter((s) => s.def.group === g))]))),
    );
  } else {
    // ─── «Горизонт»: рекорд и звёзды игроков под ним ──────────────────────
    let rec: RecordId = 'bestMove';
    const board = h('div.gb-board.stack.hall-sky');
    const STARS = 41;
    const drawBoard = (animate: boolean) => {
      const p = better(rec);
      const k = p == null ? -1 : Math.round((p / 100) * (STARS - 1));
      const arc = h('div.hall-arc', { attrs: { 'aria-hidden': 'true' } });
      for (let i = 0; i < STARS; i++) {
        const x = i / (STARS - 1);
        const y = Math.sin(x * Math.PI) * 26;
        // Мелкая неровность — живое небо, а не линейка; от индекса, чтобы не прыгало
        const jitter = ((i * 37) % 7) - 3;
        const cls = i === k ? '.you' : i < k ? '.lit' : '';
        arc.append(h(`i${cls}`, { style: `--x: ${(x * 100).toFixed(2)}%; --y: ${(y + jitter * (i === k ? 0 : 1)).toFixed(1)}px; --d: ${animate ? i * 22 : 0}ms` }));
      }
      board.replaceChildren(
        h('div.gb-tally', null, [
          h('h3', null, d.record[rec]),
          h('b.hall-value', null, recordText(rec)),
        ]),
        arc,
        p == null ? h('span.hall-better.off', null, d.offline) : betterLine(p)!,
      );
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => arc.classList.add('on')));
      else arc.classList.add('on', 'still');
    };
    const rows = h('div.hall-recrows');
    for (const id of RECORDS) {
      const b = h(`button.hall-recrow${id === rec ? '.on' : ''}`, { type: 'button', attrs: { 'aria-pressed': String(id === rec) } }, [
        h('span', null, d.record[id]),
        h('b', null, recordText(id)),
      ]);
      b.addEventListener('click', () => {
        if (rec === id) return;
        rec = id;
        rows.querySelectorAll('button').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        drawBoard(true);
      });
      rows.append(b);
    }
    const featRow = (s: FeatState) => h(`div.hall-feat${s.done ? '.done' : ''}`, null, [
      medal(s, 44),
      h('span.hall-feat-text', null, [h('b', null, featName(s)), h('small', null, featDesc(s))]),
      h('span.hall-feat-side', null, [
        s.done || s.secret ? (have(s) ? h('em', null, `${pct(stats!.feats[s.def.id]!)}%`) : null)
        : s.goal > 1 ? h('em.dim', null, format(d.of, { n: num(s.value), total: num(s.goal) }))
        : null,
      ]),
    ]);
    const tiers: FeatTier[] = [3, 2, 1, 0];
    drawBoard(true);
    pin.append(board, h('div.coll-block.hall-records', null, [section(d.records, null), rows]));
    scroll.append(...[
      h('div.coll-block.hall-records', null, [section(d.records, null), rows.cloneNode(true) as HTMLElement]),
      section(d.feats, null),
      tally(),
      nearest ? h('div.hall-nearest', null, [h('span.hall-group', null, d.nearest), featRow(nearest)]) : null,
      ...tiers.flatMap((tier) => {
        const list = states.filter((s) => s.def.tier === tier).sort((a, b) => Number(b.done) - Number(a.done));
        return [h('span.hall-group', null, d.tierHead[tier]), h('div.hall-feats', null, list.map(featRow))];
      }),
    ].filter((x): x is HTMLElement => !!x));
    // Копия рекордов в списке (узкий экран) — те же кнопки
    scroll.querySelectorAll<HTMLButtonElement>('.hall-recrows button').forEach((b, i) => b.addEventListener('click', () => rows.querySelectorAll<HTMLButtonElement>('button')[i]!.click()));
    rows.addEventListener('click', () => scroll.querySelectorAll('.hall-recrows button').forEach((x, i) => x.classList.toggle('on', RECORDS[i] === rec)));
  }

  modal(body, { title: d.title, className: `board-modal collection-modal hall-modal hall-${variant}` });
}
