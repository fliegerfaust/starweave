import { ru } from '../../src/i18n/ru.ts';
import { RETENTION_DAYS } from './db.ts';
import { STACK_SCRIPT } from './stack-decoder.ts';
import { dayLabel, type Stats } from './stats.ts';

/**
 * Страница сводки: одна HTML-страница без скриптов и внешних файлов. Написана для
 * чтения, а не для разработчика: крупные числа, под каждым блоком — как его читать,
 * названия Знамений и ночей по-русски из словаря игры.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => n.toLocaleString('ru-RU');
const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

/** Последняя глава забега (FINAL_ANTE игры): победный run_end приходит с главой на 1 больше. */
const FINAL_ANTE = 8;
const PLATFORM: Record<string, string> = { web: 'Сайт', telegram: 'Telegram', yandex: 'Яндекс Игры', pikabu: 'Пикабу Игры', crazygames: 'CrazyGames' };
const NIGHT: Record<string, string> = { dusk: ru.night.dusk, midnight: ru.night.midnight, eclipse: ru.night.eclipse };
const RESULT: Record<string, string> = { lost: 'проиграли', abandon: 'сдались', victory: 'победили' };
const PLACEMENT: Record<string, string> = { between_antes: 'Между главами', revive: 'Второй шанс', double_reward: 'Удвоить награду' };
const AD_KIND: Record<string, string> = { interstitial: 'межстраничная', rewarded: 'за награду' };
const KIND: Record<string, string> = { omen: 'Знамения', chart: 'Звёздные карты', ritual: 'Ритуалы', pack: 'Пакеты' };

function itemName(kind: string, id: string): string {
  const dict = ru as unknown as Record<string, Record<string, unknown>>;
  if (kind === 'omen') return firstOf(dict.omen?.[id]) ?? id;
  if (kind === 'ritual') return firstOf(dict.ritual?.[id]) ?? id;
  if (kind === 'pack') return firstOf(dict.pack?.[id]) ?? id;
  if (kind === 'chart') return `Звёздная карта: ${(dict.combo?.[id] as string | undefined) ?? id}`;
  return id;
}

function firstOf(v: unknown): string | null {
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
}

/** Шаги, у которых в словаре обучения не строка, а группа текстов. */
const STEP: Record<string, string> = { reward: 'Награда за первую ночь', hand: 'Рука', formula: 'Как считаются очки', items: 'Предметы' };

function tutorialLabel(step: string): string {
  const text = (ru.tut as Record<string, unknown>)[step];
  if (typeof text !== 'string') return STEP[step] ?? step;
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
}

/** Горизонтальная полоса-доля. */
function bar(value: number, max: number, tone = 'accent'): string {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return `<span class="bar"><span class="fill ${tone}" style="width:${w}%"></span></span>`;
}

function section(title: string, hint: string, body: string): string {
  return `<section class="card"><h2>${esc(title)}</h2><p class="hint">${esc(hint)}</p>${body}</section>`;
}

function empty(text = 'Пока нет данных за этот период.'): string {
  return `<p class="empty">${esc(text)}</p>`;
}

/** Длительность без ложной точности и без «0 мин»: секунды, минуты с десятыми, целые минуты. */
function duration(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} с`;
  if (min < 10) return `${min.toFixed(1).replace('.', ',')} мин`;
  return `${Math.round(min)} мин`;
}

function kpi(value: string, label: string, note: string): string {
  return `<div class="kpi"><div class="kpi-value">${value}</div><div class="kpi-label">${esc(label)}</div><div class="kpi-note">${esc(note)}</div></div>`;
}

/** Столбики по дням: новые игроки поверх вернувшихся. */
function dailyChart(daily: Stats['daily']): string {
  if (daily.every((d) => d.players === 0)) return empty();
  const max = Math.max(1, ...daily.map((d) => d.players));
  const w = 640;
  const h = 160;
  const gap = 4;
  const bw = Math.max(4, (w - gap * (daily.length - 1)) / daily.length);
  const every = Math.ceil(daily.length / 10);
  // Числа над столбиками — пока они помещаются в ширину столбика
  const showValues = bw >= 14;
  const bars = daily
    .map((d, i) => {
      const x = i * (bw + gap);
      const total = (d.players / max) * (h - 20);
      const fresh = (Math.min(d.newPlayers, d.players) / max) * (h - 20);
      const anchor = i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle';
      const lx = anchor === 'start' ? x : anchor === 'end' ? x + bw : x + bw / 2;
      // Последняя дата всегда подписана, поэтому соседнюю обычную подпись перед ней пропускаем
      const last = i === daily.length - 1;
      const label = last || (i % every === 0 && daily.length - 1 - i >= every) ? `<text x="${lx}" y="${h + 14}" text-anchor="${anchor}">${esc(dayLabel(d.day))}</text>` : '';
      const value = showValues && d.players > 0 ? `<text class="v" x="${x + bw / 2}" y="${h - total - 5}" text-anchor="middle">${d.players}</text>` : '';
      return `<g><title>${esc(dayLabel(d.day))}: игроков ${d.players}, из них новых ${d.newPlayers}, сессий ${d.sessions}</title>
        <rect class="ret" x="${x}" y="${h - total}" width="${bw}" height="${total}" rx="3"/>
        <rect class="new" x="${x}" y="${h - fresh}" width="${bw}" height="${fresh}" rx="3"/>${value}${label}</g>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 -4 ${w} ${h + 22}" role="img" aria-label="Игроки по дням">${bars}</svg>
    <div class="legend"><span><i class="sw new"></i>новые</span><span><i class="sw ret"></i>вернувшиеся</span></div>`;
}

function table(head: string[], rows: string[][], numericFrom = 1): string {
  const th = head.map((c, i) => `<th${i >= numericFrom ? ' class="n"' : ''}>${esc(c)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= numericFrom ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** site — адрес сайта игры: оттуда страница берёт карты исходников, чтобы расшифровать стек. */
export function renderDashboard(s: Stats, opts: { site?: string } = {}): string {
  const t = s.totals;
  const updated = new Date(s.generatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const periods: [number, string][] = [
    [1, 'Сегодня'],
    [7, '7 дней'],
    [30, '30 дней'],
    [90, '90 дней'],
  ];
  const tabs = periods.map(([d, label]) => `<a href="?days=${d}"${d === s.periodDays ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('');

  const kpis = `<div class="kpis">
    ${kpi(fmt(t.players), 'игроков за период', `всего за всё время — ${fmt(t.playersAll)}`)}
    ${kpi(fmt(t.newPlayers), 'новых', 'впервые открыли игру в этот период')}
    ${kpi(fmt(t.sessions), 'сессий', t.bounceSessions ? `открыли и сразу закрыли: ${fmt(t.bounceSessions)} (${pct(t.bounceSessions, t.sessions)})` : 'одна сессия — один запуск игры')}
    ${kpi(t.medianSessionMin === null ? '—' : duration(t.medianSessionMin), 'типичная сессия', 'время в игре без пауз дольше 5 минут; половина сессий короче')}
  </div>`;

  const r = s.retention;
  const retention = `<div class="kpis two">
    ${kpi(pct(r.d1, r.d1Base), 'вернулись на следующий день', r.d1Base ? `${r.d1} из ${r.d1Base} игроков` : 'нужно, чтобы прошли сутки')}
    ${kpi(pct(r.week, r.weekBase), 'вернулись в течение недели', r.weekBase ? `${r.week} из ${r.weekBase} игроков` : 'нужно, чтобы прошла неделя')}
  </div>`;

  const maxPlatform = Math.max(1, ...s.platforms.map((p) => p.players));
  const platforms = s.platforms.length
    ? `<ul class="rows">${s.platforms
        .map((p) => `<li><span class="name">${esc(PLATFORM[p.platform] ?? p.platform)}</span>${bar(p.players, maxPlatform)}<span class="num">${fmt(p.players)}</span></li>`)
        .join('')}</ul>`
    : empty();

  const tu = s.tutorial;
  const stepBase = Math.max(1, ...tu.steps.map((st) => st.players));
  const tutorial = tu.started
    ? `<p class="lead">Начали обучение <b>${fmt(tu.started)}</b>, прошли до конца <b>${fmt(tu.completed)}</b> (${pct(tu.completed, tu.started)}), пропустили <b>${fmt(tu.skipped)}</b>.</p>
      ${tu.steps.length ? `<h3>${tu.track === 'short' ? 'Короткое обучение' : 'Полное обучение'}: от дошедших до первого шага</h3>` : ''}
      <ol class="rows funnel">${tu.steps
        .map((st) => `<li><span class="name"><span class="idx">${st.index}</span>${esc(tutorialLabel(st.step))}</span>${bar(st.players, stepBase)}<span class="num">${pct(st.players, stepBase)}</span></li>`)
        .join('')}</ol>`
    : empty('Обучение в этот период никто не начинал.');

  const ru2 = s.runs;
  const maxReach = Math.max(1, ...ru2.reach.map((x) => x.runs));
  const runs = ru2.started
    ? `<p class="lead">Начато забегов <b>${fmt(ru2.started)}</b>, закончено <b>${fmt(ru2.ended)}</b>, побед <b>${fmt(ru2.victories)}</b>.${
        ru2.byResult.length ? ` Чем кончились: ${ru2.byResult.map((x) => `${RESULT[x.result] ?? x.result} — ${fmt(x.count)}`).join(', ')}.` : ''
      }</p>
      ${ru2.reach.length ? `<h3>До какой главы доходят</h3><ul class="rows">${ru2.reach.map((x) => `<li><span class="name">${x.ante > FINAL_ANTE ? `Прошли все ${FINAL_ANTE}` : `Глава ${x.ante}`}</span>${bar(x.runs, maxReach)}<span class="num">${fmt(x.runs)}</span></li>`).join('')}</ul>` : ''}`
    : empty('Забегов в этот период не было.');

  const nights = s.nights.length
    ? table(
        ['Ночь', 'Сыграно', 'Проиграно', 'Ходов в запасе'],
        s.nights.map((n) => {
          const lossShare = n.played ? n.lost / n.played : 0;
          const tone = lossShare >= 0.4 ? 'bad' : lossShare >= 0.2 ? 'warn' : 'ok';
          return [
            `Глава ${n.ante} · ${esc(NIGHT[n.night] ?? n.night)}`,
            fmt(n.played),
            `<span class="pill ${tone}">${pct(n.lost, n.played)}</span>`,
            n.movesLeft === null ? '—' : n.movesLeft.toFixed(1),
          ];
        }),
      )
    : empty('Ночей в этот период не сыграно.');

  // Внутри вида — без приставки «Звёздная карта:», вид уже в заголовке
  const shortName = (kind: string, id: string) => itemName(kind, id).replace(/^Звёздная карта: /, '');
  const shop = s.shop.byKind.length
    ? `<p class="lead">${s.shop.byKind.map((k) => `${esc(KIND[k.kind] ?? k.kind)} — <b>${fmt(k.count)}</b> (${fmt(k.players)} игр.)`).join(' · ')}</p>${s.shop.byKind
        .map((k) => {
          const items = s.shop.top.filter((x) => x.kind === k.kind);
          const max = Math.max(1, ...items.map((x) => x.count));
          return `<h3>${esc(KIND[k.kind] ?? k.kind)}</h3><ul class="rows">${items
            .map((x) => `<li><span class="name">${esc(shortName(x.kind, x.id))}</span>${bar(x.count, max, 'gold')}<span class="num">${fmt(x.count)}</span></li>`)
            .join('')}</ul>`;
        })
        .join('')}`
    : empty('Покупок в этот период не было.');

  const fu = s.funnel;
  const top = fu[0]?.players ?? 0;
  const funnel = top
    ? `<ol class="rows funnel">${fu
        .map((st, i) => `<li><span class="name"><span class="idx">${i + 1}</span>${esc(st.step)}</span>${bar(st.players, top)}<span class="num">${fmt(st.players)} · ${pct(st.players, top)}</span></li>`)
        .join('')}</ol>`
    : empty('Новых игроков в этот период не было.');

  const g = s.growth;
  const res = g.results;
  const growth = `<div class="kpis four">
    ${kpi(fmt(g.shared), 'вызовов отправлено', g.sharers ? `от ${fmt(g.sharers)} игр.` : 'кнопка «Бросить вызов»')}
    ${kpi(fmt(g.opened), 'открыли по вызову', `из них новых — ${fmt(g.openedFresh)}`)}
    ${kpi(fmt(g.accepted), 'приняли вызов', g.opened ? `${pct(g.accepted, g.opened)} открывших` : 'окно «Вызов от друга»')}
    ${kpi(fmt(res.beat + res.tie + res.behind), 'доиграли вызов', `побили — ${fmt(res.beat)}, ничья — ${fmt(res.tie)}, друг впереди — ${fmt(res.behind)}`)}
  </div>${
    g.sources.length
      ? `<h3>Метки источников</h3>${table(
          ['Метка', 'Игроков', 'Из них новых'],
          g.sources.map((x) => [`<code>${esc(x.source)}</code>`, fmt(x.players), fmt(x.fresh)]),
        )}`
      : '<p class="empty">Ссылок с меткой <code>startapp=src_…</code> пока не открывали.</p>'
  }`;

  const help = `<div class="kpis three">
    ${kpi(fmt(s.help.guide), 'открыли справочник', 'кнопка «?» и ссылки на термины')}
    ${kpi(fmt(s.help.banish), 'убрали карту', 'услуга Обсерватории')}
    ${kpi(fmt(s.help.rerolls), 'обновили витрину', 'кнопка «Обновить»')}
  </div>`;

  const ads = s.ads.length
    ? table(
        ['Где', 'Показов', 'Досмотрели'],
        s.ads.map((a) => [`${esc(PLACEMENT[a.placement] ?? a.placement)} <small class="where">${esc(AD_KIND[a.kind] ?? a.kind)}</small>`, fmt(a.requests), a.kind === 'rewarded' ? pct(a.rewarded, a.requests) : '—']),
      )
    : empty('Рекламы пока нет: она будет в Яндекс Играх (между главами и за награду) и в Telegram через AdsGram.');

  const tech = `${
    s.perf.length
      ? `<h3>Плавность (кадров в секунду, типичное значение)</h3><ul class="rows">${s.perf
          .map((p) => `<li><span class="name">${esc(PLATFORM[p.platform] ?? p.platform)}</span>${bar(p.medianFps, 60, p.medianFps >= 50 ? 'ok' : p.medianFps >= 30 ? 'warn' : 'bad')}<span class="num">${p.medianFps}</span></li>`)
          .join('')}</ul>`
      : ''
  }${
    s.versions.length ? `<h3>Версии игры</h3><p class="lead">${s.versions.map((v) => `${esc(v.version)} — ${fmt(v.players)}`).join(' · ')}</p>` : ''
  }<h3>Ошибки</h3>${
    s.errors.length
      ? table(
          ['Сообщение (свежие сверху)', 'Раз', 'Последняя'],
          s.errors.map((e) => [
            `<code>${esc(e.message)}</code>${e.where ? `<br><small class="where">${esc(e.where)}</small>` : ''}${
              e.versions.length ? `<br><small class="where">версии: ${esc(e.versions.join(', '))}</small>` : ''
            }${e.stack ? `<details class="stack"><summary>Стек</summary><pre data-stack>${esc(e.stack)}</pre></details>` : ''}`,
            fmt(e.count), esc(new Date(e.last).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))]),
        )
      : '<p class="empty good">Ошибок не было.</p>'
  }`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Звёздное плетение — сводка</title>
<style>${CSS}</style>
</head>
<body data-site="${esc(opts.site ?? '')}">
<header class="top">
  <div>
    <h1>Звёздное плетение <span>сводка</span></h1>
    <p class="updated">Обновлено ${esc(updated)} по Москве · событий за период ${fmt(t.events)}</p>
  </div>
  <nav class="tabs" aria-label="Период">${tabs}</nav>
</header>
<main>
  ${section('Игроки', 'Сколько людей играло и как долго. Игрок — одно устройство: телефон и компьютер одного человека считаются двумя.', kpis + dailyChart(s.daily))}
  ${section('Возвращаются ли', 'Главный признак, что игра цепляет. Ориентир для мобильных игр: на следующий день возвращаются 30–40%.', retention)}
  ${section('Первые минуты', 'Новички этого периода: сколько дошли до каждого шага. «Закончили обучение» — прошли или пропустили. Самый большой провал — первое, что чинить.', funnel)}
  ${section('Откуда играют', 'Игроки по площадкам за период.', platforms)}
  ${section('Рост', 'Вызовы друзьям («Бросить вызов» после забега) и ссылки с меткой источника — какие каналы приводят людей.', growth)}
  ${section('Обучение', 'Сколько игроков дошли до каждого шага, от дошедших до первого. Резкий провал между шагами — место, где непонятно или скучно.', tutorial)}
  ${section('Забеги', 'Как далеко заходят игроки. Если почти все обрываются на одной главе — там слишком резкий скачок сложности.', runs)}
  ${section('Где сложно', 'Каждая ночь: сколько раз её играли и как часто проигрывали. Красным — проигрывают 40% и чаще. «Ходов в запасе» — сколько ходов в среднем оставалось у победивших: меньше 3 — проходят на грани.', nights)}
  ${section('Что покупают в Обсерватории', 'Сколько покупок каждого вида и самое популярное внутри вида. «Звёздную пыль» покупают и в обучении — она там обязательна.', shop)}
  ${section('Пользуются ли подсказками', 'Если справочник открывают часто — какое-то правило объяснено плохо.', help)}
  ${section('Реклама', 'Показы рекламы: межстраничная — между главами, за награду — «Второй шанс» и «Удвоить награду» (сколько досмотрели).', ads)}
  ${section('Техника', 'Плавность на устройствах игроков, версии и ошибки в коде.', tech)}
</main>
<footer>Данные анонимные: случайный номер устройства, без имён, адресов и IP. Хранятся на сервере в Москве ${RETENTION_DAYS} дней.</footer>
${s.errors.some((e) => e.stack) ? `<script>${STACK_SCRIPT}</script>` : ''}
</body>
</html>`;
}

const CSS = `
:root{--bg:#f6f5fb;--card:#fff;--ink:#1b1a2e;--dim:#6b6888;--line:#e6e3f2;--accent:#6b56e8;--accent-2:#b9adf7;--gold:#e0a12e;--ok:#2f9e6b;--warn:#d98c1f;--bad:#d9465e;--chip:#f0eefb}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b1f;--card:#15142e;--ink:#eeecff;--dim:#a39fc7;--line:#29274a;--accent:#9d8cff;--accent-2:#4a3f9c;--gold:#f6c25b;--ok:#5fd39a;--warn:#f0ad4e;--bad:#ff6b85;--chip:#221f45}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.top{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;max-width:1080px;margin:0 auto;padding:32px 20px 8px}
h1{margin:0;font-size:28px;letter-spacing:-.01em}h1 span{color:var(--dim);font-weight:500}
.updated{margin:4px 0 0;color:var(--dim);font-size:14px}
.tabs{display:flex;gap:4px;background:var(--chip);padding:4px;border-radius:12px}
.tabs a{padding:8px 14px;border-radius:9px;color:var(--dim);text-decoration:none;font-weight:600;font-size:14px}
.tabs a.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)}
main{max-width:1080px;margin:0 auto;padding:8px 20px 24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;min-width:0}
.card:nth-child(1),.card:nth-child(4),.card:nth-child(5),.card:nth-child(6),.card:nth-child(10){grid-column:1/-1}
h2{margin:0;font-size:19px}h3{margin:18px 0 8px;font-size:15px;color:var(--dim);font-weight:600}
.hint{margin:4px 0 16px;color:var(--dim);font-size:14px;max-width:70ch}
.lead{margin:0 0 12px}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
.kpis.two{grid-template-columns:repeat(2,minmax(0,1fr));margin:0}
.kpis.four{margin:0}
.kpis.three{grid-template-columns:repeat(3,minmax(0,1fr));margin:0}
.kpi{background:var(--chip);border-radius:12px;padding:14px 16px}
.kpi-value{font-size:30px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi-label{font-weight:600;margin-top:2px}
.kpi-note{color:var(--dim);font-size:13px;margin-top:2px}
.chart{width:100%;height:auto;display:block}
.chart text{font-size:11px;fill:var(--dim)}.chart text.v{fill:var(--ink);font-weight:600}
.chart .ret{fill:var(--accent-2)}.chart .new{fill:var(--accent)}
.legend{display:flex;gap:16px;color:var(--dim);font-size:13px;margin-top:6px}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}.sw.new{background:var(--accent)}.sw.ret{background:var(--accent-2)}
.rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.rows li{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(80px,1fr) auto;gap:12px;align-items:center}
.rows .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rows .num{font-variant-numeric:tabular-nums;font-weight:600;min-width:3ch;text-align:right}
.idx{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--chip);color:var(--dim);font-size:12px;font-weight:700;margin-right:8px}
.bar{display:block;height:10px;background:var(--chip);border-radius:6px;overflow:hidden}
.fill{display:block;height:100%;border-radius:6px}.fill.accent{background:var(--accent)}.fill.gold{background:var(--gold)}.fill.ok{background:var(--ok)}.fill.warn{background:var(--warn)}.fill.bad{background:var(--bad)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:15px}
th{text-align:left;color:var(--dim);font-weight:600;font-size:13px;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:9px 8px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;min-width:48px;text-align:center;padding:2px 8px;border-radius:999px;font-weight:700;font-size:13px}
.pill.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}
.pill.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.pill.bad{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
code{font-size:13px;word-break:break-word}
.where{color:var(--dim);font-size:12px;font-family:ui-monospace,monospace;word-break:break-all}
.stack{margin-top:6px}.stack summary{cursor:pointer;color:var(--dim);font-size:12px}
.stack pre{margin:6px 0 0;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all}
.stack .decoded small{display:block;color:var(--dim);font-size:11px;margin-bottom:4px}
.empty{color:var(--dim);margin:0;padding:12px 0}.empty.good{color:var(--ok)}
footer{max-width:1080px;margin:0 auto;padding:8px 20px 40px;color:var(--dim);font-size:13px}
@media (max-width:760px){main{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpis.three{grid-template-columns:1fr}.top{padding-top:20px}h1{font-size:23px}.kpi-value{font-size:26px}.rows li{grid-template-columns:minmax(0,1fr) 72px auto}}
`;
