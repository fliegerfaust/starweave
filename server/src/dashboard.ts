import { readFileSync } from 'node:fs';
import { ru } from '../../src/i18n/ru.ts';
import { RETENTION_DAYS } from './db.ts';
import { COHORT_DAYS, ERRORS_SINCE, FUNNEL_STEPS, SESSION_BUCKETS, type Feature } from './play-stats.ts';
import { STACK_SCRIPT } from './stack-decoder.ts';
import { dayLabel, type Stats } from './stats.ts';

/**
 * Страница сводки, вариант B «Приборы» (ST.3, выбор Дениса): строка главных чисел, ниже
 * сетка блоков. Одна HTML-страница без внешних файлов и без скриптов (кроме расшифровки
 * стеков): шрифты игры вшиты, графики — SVG. Мир игры: ночь, золото, свет.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => n.toLocaleString('ru-RU');
const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');
const dec = (n: number | null): string => (n === null ? '–' : Number.isInteger(n) ? fmt(n) : n.toFixed(1).replace('.', ','));

const PLATFORM: Record<string, string> = { web: 'Сайт', telegram: 'Telegram', yandex: 'Яндекс Игры', pikabu: 'Пикабу Игры', crazygames: 'CrazyGames' };
const platformName = (p: string) => PLATFORM[p] ?? p;
const NIGHTS = ['dusk', 'midnight', 'eclipse'] as const;
const NIGHT: Record<string, string> = { dusk: ru.night.dusk, midnight: ru.night.midnight, eclipse: ru.night.eclipse };
const PLACEMENT: Record<string, string> = { between_antes: 'между главами', revive: 'второй шанс', double_reward: 'удвоить награду' };
/** Последняя глава забега (FINAL_ANTE игры): победный run_end приходит с главой на 1 больше. */
const FINAL_ANTE = 8;

function itemName(kind: string, id: string): string {
  const dict = ru as unknown as Record<string, Record<string, unknown>>;
  const v = dict[kind]?.[id];
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : id;
}

/** Шаги, у которых в словаре обучения не строка, а группа текстов. */
/** Короткие имена шагов: тексты подсказок обучения для таблицы слишком длинные. */
const STEP: Record<string, string> = {
  shortRow: 'Собрать первый ряд',
  shortBurn: 'Сжечь карту',
  shortCross: 'Крест из двух линий',
  reward: 'Награда за первую ночь',
  hand: 'Рука',
  formula: 'Как считаются очки',
  items: 'Предметы',
};

function tutorialLabel(step: string): string {
  if (STEP[step]) return STEP[step];
  const text = (ru.tut as Record<string, unknown>)[step];
  if (typeof text !== 'string') return step;
  return text.length > 48 ? `${text.slice(0, 46).trimEnd()}…` : text;
}

/** Длительность без ложной точности и без «0 мин»: секунды, минуты с десятыми, целые минуты. */
function duration(min: number | null): string {
  if (min === null) return '–';
  if (min < 1) return `${Math.round(min * 60)} с`;
  if (min < 10) return `${min.toFixed(1).replace('.', ',')} мин`;
  return `${Math.round(min)} мин`;
}

const bar = (share: number, tone = '') => `<div class="bar${tone ? ` ${tone}` : ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%"></i></div>`;
const foot = (text: string) => `<p class="foot">${text}</p>`;
const few = '<span class="few">мало</span>';
const empty = (text = 'Пока нет данных за этот период.') => `<p class="empty">${esc(text)}</p>`;

/** Стрелка к прошлой неделе: зелёная, если стало лучше. */
function delta(cur: number | null, prev: number | null, goodUp = true, unit = ''): string {
  if (cur === null || prev === null) return '';
  if (cur === prev) return '<span class="dl">как неделей раньше</span>';
  const up = cur > prev;
  return `<span class="dl ${up === goodUp ? 'up' : 'down'}">${up ? '▲' : '▼'} было ${dec(prev)}${unit}</span>`;
}

function cell(span: 4 | 5 | 6 | 7, title: string, body: string): string {
  return `<section class="cell c${span}"><h2>${esc(title)}</h2>${body}</section>`;
}

// ── На что смотреть: правила по цифрам ──────────────────────────────────────

type Tone = 'hot' | 'tick' | 'good';

export function watchItems(s: Stats): { tone: Tone; title: string; text: string }[] {
  const p = s.play;
  const out: { tone: Tone; title: string; text: string }[] = [];
  const tu = s.tutorial;

  if (tu.track === 'short' && tu.trackPlayers >= 5 && p.tutorialStuck.players / tu.trackPlayers >= 0.35) {
    const sec = p.tutorialStuck.medianSec;
    out.push({
      tone: 'hot',
      title: 'Обучение теряет игроков на первом шаге',
      text: `Из ${tu.trackPlayers} начавших короткое обучение ${p.tutorialStuck.players} не собрали ни одного ряда${
        sec === null ? '' : sec < 1 ? ', половина закрыла игру в ту же секунду' : `, половина ушла за ${dec(sec)} с`
      }.`,
    });
  }

  const rated = p.platformFunnel.filter((f) => f.steps[0]! >= 5).map((f) => ({ ...f, rate: f.steps[2]! / f.steps[0]! }));
  const best = Math.max(0, ...rated.map((f) => f.rate));
  for (const f of rated.filter((x) => x.rate < best / 2)) {
    const others = rated.filter((x) => x !== f).map((x) => `${platformName(x.platform)} ${pct(x.steps[2]!, x.steps[0]!)}`);
    out.push({
      tone: 'hot',
      title: `${platformName(f.platform)}: почти не доходят до игры`,
      text: `Обучение прошли ${f.steps[2]} из ${f.steps[0]} (${pct(f.steps[2]!, f.steps[0]!)}).${others.length ? ` Для сравнения: ${others.join(', ')}.` : ''}`,
    });
  }

  const fn = p.week.firstNight;
  if (fn.played >= 10 && fn.won / fn.played < 0.5) {
    out.push({ tone: 'hot', title: 'Первая ночь слишком сложная', text: `За неделю её выиграли ${pct(fn.won, fn.played)} (${fn.won} из ${fn.played}).` });
  }

  if (p.week.errors > 0) {
    out.push({ tone: 'hot', title: `Ошибки в игре: ${p.week.errors} за неделю`, text: 'Список и стеки в блоке «Здоровье».' });
  }

  const w = p.week.minPerDay;
  const pw = p.prevWeek.minPerDay;
  if (w !== null && pw !== null && pw >= 1) {
    if (w / pw <= 0.6) out.push({ tone: 'tick', title: 'Играют меньше', text: `${dec(w)} мин в игре на игрока за день против ${dec(pw)} неделей раньше.` });
    else if (w / pw >= 1.5) out.push({ tone: 'good', title: 'Играют дольше', text: `${dec(w)} мин в игре на игрока за день против ${dec(pw)} неделей раньше.` });
  }

  if (p.prevWeek.players >= 10) {
    const r = p.week.players / p.prevWeek.players;
    if (r <= 0.6) out.push({ tone: 'tick', title: 'Игроков стало меньше', text: `${p.week.players} за неделю против ${p.prevWeek.players} неделей раньше.` });
    else if (r >= 1.5) out.push({ tone: 'good', title: 'Игроков стало больше', text: `${p.week.players} за неделю против ${p.prevWeek.players} неделей раньше.` });
  }

  const unused = p.features.filter((f) => !f.need && f.available >= 5 && f.used === 0);
  if (unused.length) {
    out.push({ tone: 'tick', title: 'Новыми фичами не пользуются', text: `${unused.map((f) => f.name).join(', ')}: ни одного игрока за период.` });
  }

  const r = s.retention;
  if (r.d1Base >= 10 && r.d1 / r.d1Base < 0.2) {
    out.push({ tone: 'tick', title: 'Мало возвращаются', text: `На следующий день вернулись ${pct(r.d1, r.d1Base)} (${r.d1} из ${r.d1Base}). Ориентир для мобильных игр от 30 до 40%.` });
  }

  if (p.money.paid > 0) out.push({ tone: 'good', title: `Оплат за период: ${p.money.paid}`, text: 'Подробности в блоке «Деньги и реклама».' });

  const order: Record<Tone, number> = { hot: 0, tick: 1, good: 2 };
  out.sort((a, b) => order[a.tone] - order[b.tone]);
  return out.length ? out.slice(0, 6) : [{ tone: 'good', title: 'Ничего тревожного', text: 'Цифры недели в обычных пределах.' }];
}

// ── Блоки ───────────────────────────────────────────────────────────────────

function dailyBars(daily: Stats['daily']): string {
  if (daily.every((d) => d.players === 0)) return empty();
  const h = 120;
  const max = Math.max(1, ...daily.map((d) => d.players));
  const w = 100 / daily.length;
  const every = Math.max(1, Math.ceil(daily.length / 5));
  const bars = daily
    .map((d, i) => {
      const ph = (d.players / max) * (h - 18);
      const nh = (Math.min(d.newPlayers, d.players) / max) * (h - 18);
      const x = (i * w + w * 0.15).toFixed(2);
      const bw = (w * 0.7).toFixed(2);
      return `<rect x="${x}%" y="${(h - 16 - ph).toFixed(1)}" width="${bw}%" height="${ph.toFixed(1)}" rx="2" class="all"><title>${esc(dayLabel(d.day))}: игроков ${d.players}, новых ${d.newPlayers}, сессий ${d.sessions}</title></rect><rect x="${x}%" y="${(h - 16 - nh).toFixed(1)}" width="${bw}%" height="${nh.toFixed(1)}" rx="2" class="new"/>`;
    })
    .join('');
  // Последняя дата подписана всегда, поэтому обычную подпись слишком близко к ней пропускаем
  const labels = daily
    .map((d, i) => {
      const last = i === daily.length - 1;
      if (!last && (i % every !== 0 || daily.length - 1 - i < every)) return '';
      // Крайние подписи прижаты к краю, иначе на телефоне обрезаются
      const anchor = i === 0 ? 'start' : last ? 'end' : 'middle';
      const x = anchor === 'start' ? i * w : anchor === 'end' ? (i + 1) * w : i * w + w / 2;
      return `<text x="${x.toFixed(2)}%" y="${h - 2}" text-anchor="${anchor}">${esc(dayLabel(d.day))}</text>`;
    })
    .join('');
  return `<div class="legend"><span><i class="sw new"></i>новые</span><span><i class="sw all"></i>все игроки</span></div><svg class="days" width="100%" height="${h}" role="img" aria-label="Игроки по дням">${bars}${labels}</svg>`;
}

function platformCards(s: Stats): string {
  const list = s.play.platforms.slice(0, 3);
  if (!list.length) return '';
  return `<div class="trio">${list
    .map((p) => `<div class="pcard"><span class="lab">${esc(platformName(p.platform))}</span><span class="num mid">${fmt(p.players)}</span><span class="faint">игроков, ${fmt(p.sessions)} сессий, сессия ${duration(p.medianMin)}</span></div>`)
    .join('')}</div>`;
}

function growthLine(s: Stats): string {
  const g = s.growth;
  const parts: string[] = [];
  if (g.shared || g.opened) parts.push(`Вызовы друзьям: отправили ${fmt(g.shared)}, открыли ${fmt(g.opened)}, приняли ${fmt(g.accepted)}.`);
  if (g.sources.length) parts.push(`Метки ссылок: ${g.sources.map((x) => `<code>${esc(x.source)}</code> ${fmt(x.players)}`).join(', ')}.`);
  return parts.length ? foot(parts.join(' ')) : '';
}

function funnelTable(s: Stats): string {
  const pf = s.play.platformFunnel;
  if (!pf.length) return empty('Новых игроков в этот период не было.');
  const head = pf.map((f) => `<th class="r">${esc(platformName(f.platform))}</th>`).join('');
  const rows = FUNNEL_STEPS.map((step, i) => {
    const cells = pf.map((f) => {
      const k = f.steps[i]!;
      const base = f.steps[0]!;
      return `<td class="r"><div class="fc"><span><b>${pct(k, base)}</b> <span class="faint">${fmt(k)}</span></span>${bar(base ? k / base : 0, 'light')}</div></td>`;
    });
    return `<tr><td>${esc(step)}</td>${cells.join('')}</tr>`;
  });
  const back = pf.map((f) => {
    if (!f.d1Base) return '<td class="r faint">ещё рано</td>';
    return `<td class="r"><div class="fc"><span><b>${pct(f.d1, f.d1Base)}</b> <span class="faint">${f.d1}</span>${f.d1Base < 5 ? ` <span class="few">из ${f.d1Base}</span>` : ''}</span>${bar(f.d1 / f.d1Base, 'mult')}</div></td>`;
  });
  return `<div class="scroll"><table class="funnel"><thead><tr><th>Шаг новичка</th>${head}</tr></thead><tbody>${rows.join('')}<tr><td>Вернулись на 2-й день</td>${back.join('')}</tr></tbody></table></div>${foot(
    'Новички периода по площадке первого входа, доля от пришедших. «Вернулись» считается от тех, у кого второй день уже наступил.',
  )}`;
}

function sessionBlock(s: Stats): string {
  const ss = s.play.sessions;
  if (!ss.all) return empty();
  return `<p class="lead"><span class="num big">${duration(ss.medianMin)}</span> длится обычная сессия, если считать только время в игре. Среднее ${duration(ss.meanMin)}.</p>
<p class="muted">Ещё ${fmt(ss.bounce)} сессий из ${fmt(ss.all)} (${pct(ss.bounce, ss.all)}) открыли и сразу закрыли: в длину они не входят. Паузы длиннее 5 минут не считаются игрой.</p>
<p class="muted">На игрока за день: <b>${duration(s.play.perPlayerDayMin)}</b> в игре, за последнюю неделю ${duration(s.play.week.minPerDay)}.</p>${bucketsTable(ss.buckets)}`;
}

/** Сыгранные сессии по длине: видно, это минутные заходы или вечерние посиделки. */
function bucketsTable(buckets: number[]): string {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (!total) return '';
  const label = (i: number) => {
    const lo = SESSION_BUCKETS[i - 1];
    const hi = SESSION_BUCKETS[i];
    return lo === undefined ? `меньше ${hi} мин` : hi === undefined ? `${lo} мин и дольше` : `от ${lo} до ${hi} мин`;
  };
  const max = Math.max(...buckets);
  return `<table class="buckets"><thead><tr><th>Длина сессии</th><th class="r">Сессий</th><th class="r">Доля</th><th></th></tr></thead><tbody>${buckets
    .map((k, i) => `<tr><td>${label(i)}</td><td class="r">${fmt(k)}</td><td class="r">${pct(k, total)}</td><td class="w40">${bar(k / max, 'light')}</td></tr>`)
    .join('')}</tbody></table>`;
}

function featureRow(f: Feature): string {
  const since = `<span class="since faint">с ${esc(f.since)}</span>`;
  const note = f.note ? `<div class="faint small">${esc(f.note)}</div>` : '';
  if (f.need) return `<tr><td><b>${esc(f.name)}</b>${since}</td><td class="r">${fmt(f.available)}</td><td colspan="2" class="need">нужно событие <code>${esc(f.need)}</code>, появится в 0.7.11</td></tr>`;
  const base = f.met ?? f.available;
  const used = f.used ?? 0;
  return `<tr><td><b>${esc(f.name)}</b>${since}${note}</td><td class="r">${fmt(f.available)}</td><td class="r">${f.met === null ? '–' : fmt(f.met)}</td><td class="r"><b>${fmt(used)}</b> <span class="faint">${pct(used, base)}</span></td></tr>`;
}

function featuresBlock(s: Stats): string {
  return `<div class="scroll"><table class="feat"><thead><tr><th>Фича</th><th class="r">Была</th><th class="r">Встретили</th><th class="r">Взяли</th></tr></thead><tbody>${s.play.features.map(featureRow).join('')}</tbody></table></div>${foot(
    'Игроки периода на версии не старше выхода фичи. «Была»: дошли до места игры, где она возможна (Дар ночи: начали забег с даром). «Встретили»: увидели выбор (Трофеи: выиграли Затмение; Коллекция: увидели строку «Новое в Коллекции»). Прочерк: такого события нет.',
  )}`;
}

function tutorialBlock(s: Stats): string {
  const tu = s.tutorial;
  if (!tu.steps.length) return empty('Обучение в этот период никто не начинал.');
  const base = Math.max(1, ...tu.steps.map((st) => st.players));
  const row = (label: string, k: number) => `<tr><td>${label}</td><td class="r">${fmt(k)}</td><td class="r">${pct(k, base)}</td><td class="w40">${bar(k / base)}</td></tr>`;
  const other = tu.otherPlayers ? ` ${tu.track === 'short' ? 'Полное' : 'Короткое'} обучение в эти дни: прошли ${tu.otherDone} из ${tu.otherPlayers}, в таблицу не смешиваем.` : '';
  return `<table><thead><tr><th>${tu.track === 'short' ? 'Короткое обучение' : 'Полное обучение'}</th><th class="r">Игроков</th><th class="r">Доля</th><th></th></tr></thead><tbody>${tu.steps
    .map((st) => row(`${st.index}. ${esc(tutorialLabel(st.step))}`, st.players))
    .join('')}${row('Закончили', tu.trackDone)}</tbody></table>${foot(`Доля от дошедших до первого шага. Пропустили: ${tu.trackSkipped}.${other}`)}`;
}

function chaptersBlock(s: Stats): string {
  if (!s.nights.length) return empty('Ночей в этот период не сыграно.');
  const antes = [...new Set(s.nights.map((n) => n.ante))].sort((a, b) => a - b);
  const rows = antes.map((ante) => {
    const cells = NIGHTS.map((night) => {
      const n = s.nights.find((x) => x.ante === ante && x.night === night);
      if (!n) return '<td class="hm"></td>';
      const share = n.played ? n.lost / n.played : 0;
      return `<td class="hm" style="background:rgb(255 107 139/${(0.08 + share * 0.6).toFixed(2)})" title="Глава ${ante}, ${esc(NIGHT[night]!.toLowerCase())}: проиграли ${n.lost} из ${n.played}"><b>${pct(n.lost, n.played)}</b><span>${n.lost}/${n.played}</span></td>`;
    });
    return `<tr><th scope="row">Глава ${ante}</th>${cells.join('')}</tr>`;
  });
  return `<table class="heat"><thead><tr><th></th>${NIGHTS.map((n) => `<th>${esc(NIGHT[n]!)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${foot('Доля проигранных ночей, рядом проиграли из сыгранных. Ярче, значит сложнее.')}`;
}

function quitsBlock(s: Stats): string {
  const p = s.play;
  if (!p.runsStarted) return empty('Забегов в этот период не было.');
  const top = p.quits.slice(0, 6);
  const max = Math.max(1, ...top.map((q) => q.runs));
  const rows = top.map((q) => `<tr><td>Глава ${q.ante}, ${esc((NIGHT[q.night] ?? q.night).toLowerCase())}</td><td class="r">${fmt(q.runs)}</td><td class="w45">${bar(q.runs / max, 'mult')}</td></tr>`).join('');
  const r = s.runs;
  const won = r.reach.filter((x) => x.ante > FINAL_ANTE).reduce((a, x) => a + x.runs, 0);
  return `${rows ? `<table><tbody>${rows}</tbody></table>` : ''}${foot(
    `${fmt(p.runsCut)} из ${fmt(p.runsStarted)} забегов оборвались без итога: закрыли игру посреди ночи или сдались. Строка: последняя начатая ночь. Проиграли ${fmt(r.byResult.find((x) => x.result === 'lost')?.count ?? 0)}, прошли все ${FINAL_ANTE} глав ${fmt(won)}.`,
  )}`;
}

function cohortsBlock(s: Stats): string {
  const c = s.play.cohorts;
  if (!c.length) return empty('Новых игроков в этот период не было.');
  const rows = c.map((w) => {
    const cells = w.cells.map((x) =>
      x ? `<td class="hm" style="background:rgb(127 224 255/${(0.06 + (x.back / x.base) * 0.7).toFixed(2)})"><b>${pct(x.back, x.base)}</b><span>${x.back}/${x.base}</span></td>` : '<td class="hm empty"><span>ещё рано</span></td>',
    );
    return `<tr><th scope="row">с ${esc(dayLabel(w.week))}<span class="faint"> · ${w.players}</span></th>${cells.join('')}</tr>`;
  });
  return `<table class="heat"><thead><tr><th>Неделя прихода</th>${COHORT_DAYS.map((n, i) => `<th>${i ? `к ${n}-му` : `к ${n}-му дню`}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${foot(
    'Доля новичков недели, которые вернулись хоть раз за первые 1, 3 или 7 дней. Ярче, значит лучше.',
  )}`;
}

function releasesBlock(s: Stats): string {
  const list = s.play.releases.filter((r) => r.players >= 2).slice(-8);
  if (!list.length) return empty('Новичков в этот период не было.');
  const rows = list
    .map(
      (r) =>
        `<tr><td><b>${esc(r.version)}</b></td><td class="r">${fmt(r.players)}${r.players < 5 ? ` ${few}` : ''}</td><td class="r">${pct(r.tutorial, r.players)}</td><td class="r">${pct(r.night1, r.players)}</td><td class="r">${
          r.d1Base ? pct(r.d1, r.d1Base) : '<span class="faint">ещё рано</span>'
        }</td><td class="r">${duration(r.firstDayMin)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>Первый вход на версии</th><th class="r">Новичков</th><th class="r">Прошли обучение</th><th class="r">Выиграли 1-ю ночь</th><th class="r">Вернулись на 2-й день</th><th class="r">В игре в 1-й день</th></tr></thead><tbody>${rows}</tbody></table></div>${foot(
    'Стало ли лучше после выпуска: новички по версии, на которой впервые открыли игру. Версии, где пришли хотя бы двое; меньше 5 сравнивать рано.',
  )}`;
}

function omensBlock(s: Stats): string {
  const o = s.play.omens;
  if (!o.length) return empty('Знамений в этот период не покупали.');
  const rows = o.map((x) => `<tr><td>${esc(itemName('omen', x.id))}</td><td class="r">${fmt(x.bought)}</td><td class="r">${x.runs ? fmt(x.runs) : '–'}</td><td class="r">${dec(x.avgAnte)}</td></tr>`).join('');
  const ended = s.runs.reach.reduce((a, x) => a + x.runs, 0);
  const avg = ended ? Math.round((s.runs.reach.reduce((a, x) => a + Math.min(x.ante, FINAL_ANTE) * x.runs, 0) / ended) * 10) / 10 : null;
  return `<table><thead><tr><th>Знамение</th><th class="r">Куплено</th><th class="r">Забегов с ним</th><th class="r">Средняя глава</th></tr></thead><tbody>${rows}</tbody></table>${foot(
    `Средняя глава, до которой доходит забег с этим Знамением; по всем забегам ${dec(avg)}. Побед за период ${s.runs.victories}: долю побед по Знамению считать рано. Звёздную пыль покупают в обучении.`,
  )}`;
}

function moneyBlock(s: Stats): string {
  const m = s.play.money;
  const ads = s.ads.length
    ? `<table><thead><tr><th>Реклама</th><th>Где</th><th class="r">Запросов</th><th class="r">Досмотрели</th></tr></thead><tbody>${s.ads
        .map(
          (a) =>
            `<tr><td>${esc(platformName(a.platform))}</td><td>${a.kind === 'interstitial' ? 'межстраничная' : 'за награду'}, ${esc(PLACEMENT[a.placement] ?? a.placement)}</td><td class="r">${fmt(a.requests)}</td><td class="r">${
              a.kind === 'rewarded' ? pct(a.rewarded, a.requests) : '–'
            }</td></tr>`,
        )
        .join('')}</tbody></table>`
    : empty('Рекламы в этот период не было.');
  return `<div class="trio"><div><span class="num mid">${fmt(m.storeOpen)}</span><span class="lab">открыли атлас</span></div><div><span class="num mid">${fmt(m.purchaseStart)}</span><span class="lab">нажали «Купить»</span></div><div><span class="num mid">${fmt(m.paid)}</span><span class="lab">оплат</span></div></div>${ads}`;
}

function healthBlock(s: Stats): string {
  const p = s.play;
  const when = (ts: number) => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const errors = s.errors.length
    ? s.errors
        .map(
          (e) =>
            `<tr><td><code>${esc(e.message)}</code>${e.where ? `<span class="where">${esc(e.where)}</span>` : ''}<span class="where">версии: ${esc(e.versions.join(', '))}</span>${
              e.stack ? `<details class="stack"><summary>Стек</summary><pre data-stack>${esc(e.stack)}</pre></details>` : ''
            }</td><td class="r">${fmt(e.count)}</td><td class="r nowrap">${esc(when(e.last))}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="good">Ошибок нет</td></tr>';
  const fps = s.perf.length
    ? `<table><thead><tr><th>Плавность</th><th class="r">Кадров в секунду</th><th class="r">Замеров</th></tr></thead><tbody>${s.perf
        .map((f) => `<tr><td>${esc(platformName(f.platform))}</td><td class="r ${f.medianFps >= 50 ? 'good' : f.medianFps >= 30 ? 'tick' : 'hot'}">${f.medianFps}</td><td class="r faint">${fmt(f.samples)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  return `<div class="trio"><div><span class="num mid">${p.crashFree === null ? '–' : `${dec(p.crashFree)}%`}</span><span class="lab">сессий без ошибок</span></div><div><span class="num mid">${fmt(
    p.oldErrors,
  )}</span><span class="lab">ошибок версий до ${ERRORS_SINCE} скрыто</span></div><div><span class="num mid">${fmt(s.versions[0]?.players ?? 0)}</span><span class="lab">на версии ${esc(s.versions[0]?.version ?? '–')}</span></div></div>
<div class="scroll"><table><thead><tr><th>Ошибка, свежие сверху</th><th class="r">Раз</th><th class="r">Последняя</th></tr></thead><tbody>${errors}</tbody></table></div>${fps}`;
}

// ── Страница ────────────────────────────────────────────────────────────────

/** site — адрес сайта игры: оттуда страница берёт карты исходников, чтобы расшифровать стек. */
export function renderDashboard(s: Stats, opts: { site?: string } = {}): string {
  const t = s.totals;
  const p = s.play;
  const updated = new Date(s.generatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const periods: [number, string][] = [
    [1, 'Сегодня'],
    [7, '7 дней'],
    [30, '30 дней'],
    [90, '90 дней'],
  ];
  const periodName = s.periodDays === 1 ? 'сегодня' : `${s.periodDays} дней`;
  const tabs = periods.map(([d, label]) => `<a href="?days=${d}"${d === s.periodDays ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  const kpis: [string, string, string][] = [
    [`Игроков, ${periodName}`, fmt(t.players), `<span class="dl">${fmt(t.newPlayers)} новых</span>`],
    ['За неделю', fmt(p.week.players), delta(p.week.players, p.prevWeek.players)],
    ['Сессия, в игре', duration(p.sessions.medianMin), `<span class="dl">среднее ${duration(p.sessions.meanMin)}</span>`],
    ['На игрока за день', duration(p.perPlayerDayMin), `<span class="dl">за неделю ${duration(p.week.minPerDay)}</span>`],
    ['Без ошибок', p.crashFree === null ? '–' : `${dec(p.crashFree)}%`, `<span class="dl">сессий с ${ERRORS_SINCE}</span>`],
    ['Сейчас в игре', fmt(p.nowInGame), '<span class="dl">за последние 5 мин</span>'],
  ];

  const watch = watchItems(s)
    .map((w) => `<li><b class="${w.tone}">${esc(w.title)}</b><span>${esc(w.text)}</span></li>`)
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Звёздное плетение · сводка</title>
<style>${FONTS}${CSS}</style>
</head>
<body data-site="${esc(opts.site ?? '')}">
<div class="wrap">
<header class="top">
  <div><h1>Звёздное плетение · сводка</h1><p class="faint">Обновлено ${esc(updated)} по Москве · событий за период ${fmt(t.events)}</p></div>
  <nav class="period" aria-label="Период">${tabs}</nav>
</header>
<div class="kpi">${kpis.map(([label, value, note]) => `<div><span class="lab">${esc(label)}</span><span class="num">${value}</span>${note}</div>`).join('')}</div>
<main class="grid">
  ${cell(7, 'На что смотреть', `<ul class="watch">${watch}</ul>`)}
  ${cell(5, 'Игроки по дням', dailyBars(s.daily) + platformCards(s) + growthLine(s))}
  ${cell(7, 'Первые минуты по площадкам', funnelTable(s))}
  ${cell(5, 'Обучение', tutorialBlock(s))}
  ${cell(7, 'Новые фичи', featuresBlock(s))}
  ${cell(5, 'Время в игре', sessionBlock(s))}
  ${cell(4, 'Сложность глав', chaptersBlock(s))}
  ${cell(4, 'Где обрывают забег', quitsBlock(s))}
  ${cell(4, 'Возвраты по неделям', cohortsBlock(s))}
  ${cell(6, 'Выпуски', releasesBlock(s))}
  ${cell(6, 'Знамения', omensBlock(s))}
  ${cell(6, 'Деньги и реклама', moneyBlock(s))}
  ${cell(6, 'Здоровье', healthBlock(s))}
</main>
<footer>Данные анонимные: случайный номер устройства, без имён, адресов и IP. Хранятся на сервере в Москве ${RETENTION_DAYS} дней.</footer>
</div>
${s.errors.some((e) => e.stack) ? `<script>${STACK_SCRIPT}</script>` : ''}
</body>
</html>`;
}

/** Шрифты игры вшиты в страницу: внешних файлов сводка не грузит (CSP). Кириллица и латиница. */
const font = (file: string) => `url(data:font/woff2;base64,${readFileSync(new URL(`./fonts/${file}`, import.meta.url)).toString('base64')}) format('woff2')`;
const CYR = 'U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+2215';
const FONTS = `
@font-face{font-family:'Forum';font-display:swap;src:${font('forum-cyrillic.woff2')};unicode-range:${CYR}}
@font-face{font-family:'Forum';font-display:swap;src:${font('forum-latin.woff2')};unicode-range:${LAT}}
@font-face{font-family:'Manrope';font-display:swap;font-weight:200 800;src:${font('manrope-cyrillic.woff2')};unicode-range:${CYR}}
@font-face{font-family:'Manrope';font-display:swap;font-weight:200 800;src:${font('manrope-latin.woff2')};unicode-range:${LAT}}`;

const CSS = `
:root{--n0:#05061a;--n1:#0c0d2c;--n2:#191641;--ink:#eae6ff;--dim:#a5a0cf;--faint:#8a85b8;--gold:#f6c25b;--gold-hi:#ffe6a8;
--light:#7fe0ff;--mult:#ff6b8b;--ok:#7cf0b0;--hair:rgb(246 194 91/.16);--line:rgb(234 230 255/.08);
--fd:'Forum','Times New Roman',serif;--fb:'Manrope',system-ui,sans-serif;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(120% 50% at 50% 0%,#191641 0%,#0c0d2c 40%,#05061a 100%) fixed,#05061a;color:var(--ink);
font:400 14px/1.5 var(--fb);font-variant-numeric:tabular-nums;padding:0 max(24px,env(safe-area-inset-right)) 48px max(24px,env(safe-area-inset-left))}
h1,h2{font-family:var(--fd);font-weight:400;margin:0;letter-spacing:.01em}
a{color:var(--light)}
.wrap{max-width:1360px;margin:0 auto}
.num{font-family:var(--fd);color:var(--gold-hi);line-height:1}
.num.big{font-size:44px}.num.mid{font-size:30px;display:block;margin:2px 0}
.lab{display:block;font-size:12px;color:var(--dim)}
.dl{display:block;font-size:12px;color:var(--faint);margin-top:4px}.dl.up{color:var(--ok)}.dl.down{color:var(--mult)}
.few{color:var(--faint);font-size:12px;font-style:italic}
.muted{color:var(--dim)}.faint{color:var(--faint)}.small{font-size:12px}.nowrap{white-space:nowrap}
.need{color:var(--light)}.hot{color:var(--mult)}.good{color:var(--ok)}.tick{color:var(--gold)}
.foot{font-size:12px;margin:8px 0 0;color:var(--faint)}
.empty{color:var(--dim);margin:0;padding:8px 0}
.lead{font-size:16px;margin:0 0 6px}
.buckets{margin-top:14px}
code{font-size:12px;color:var(--light);word-break:break-word}
table{border-collapse:collapse;width:100%}
th{font:600 11px/1.3 var(--fb);letter-spacing:.06em;text-transform:uppercase;color:var(--faint);text-align:left;padding:6px 8px;border-bottom:1px solid var(--hair)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td.r,th.r{text-align:right}td.w40{width:40%}td.w45{width:45%}
.scroll{overflow-x:auto}
.bar{height:6px;border-radius:3px;background:rgb(234 230 255/.07);overflow:hidden;min-width:48px;margin-top:7px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#e09a2f,#f6c25b)}
.bar.light i{background:linear-gradient(90deg,#3aa6c9,#7fe0ff)}
.bar.mult i{background:linear-gradient(90deg,#c9405f,#ff6b8b)}
.fc{display:flex;flex-direction:column;align-items:flex-end;gap:4px}.fc .bar{width:100%;max-width:120px;margin-top:0}
.heat td.hm{text-align:center;border:2px solid var(--n0);border-radius:6px;padding:6px 4px}
.heat td.hm b{display:block;font-weight:700}.heat td.hm span{font-size:11px;color:var(--dim)}
.heat td.hm.empty span{color:var(--faint)}
.heat th[scope]{white-space:nowrap;font:600 13px var(--fb);color:var(--ink);text-transform:none;letter-spacing:0;border:0}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0 8px}
.pcard .lab{font-size:13px;color:var(--gold)}
.legend{display:flex;gap:14px;font-size:12px;color:var(--dim);margin-bottom:6px}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.sw.new{background:var(--gold)}.days .new{fill:var(--gold)}.sw.all{background:rgb(127 224 255/.5)}.days .all{fill:rgb(127 224 255/.35)}
.days text{font-size:11px;fill:var(--faint)}
.watch{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 32px}
.watch li{display:grid;gap:2px;align-content:start}.watch b{font-weight:700}.watch span{color:var(--dim)}
.since{margin-left:6px;font-size:12px}
.where{display:block;color:var(--faint);font-size:11px;font-family:ui-monospace,monospace;word-break:break-all}
.stack{margin-top:6px}.stack summary{cursor:pointer;color:var(--dim);font-size:12px}
.stack pre{margin:6px 0 0;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;color:var(--dim)}
.stack .decoded small{display:block;color:var(--faint);font-size:11px;margin-bottom:4px}
.top{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap;padding:28px 0 18px;border-bottom:1px solid var(--hair)}
.top h1{font-size:28px;color:var(--gold-hi)}.top p{margin:4px 0 0;font-size:13px}
.period{display:flex;gap:4px;flex-wrap:wrap}.period a{padding:6px 12px;border-radius:999px;color:var(--dim);font-size:13px;text-decoration:none}
.period a[aria-current]{color:var(--n0);background:var(--gold);font-weight:700}
.kpi{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border-bottom:1px solid var(--hair)}
.kpi>div{padding:18px 16px 18px 0;min-width:0}.kpi>div+div{padding-left:16px;border-left:1px solid var(--line)}
.kpi .num{font-size:34px;display:block;margin:2px 0}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:0 32px}
.cell{padding:22px 0;border-bottom:1px solid var(--line);min-width:0;overflow-x:auto}
.cell h2{font-size:20px;color:var(--gold-hi);margin-bottom:12px}
.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c7{grid-column:span 7}
footer{padding:20px 0 0;color:var(--faint);font-size:12px}
@media (max-width:1000px){.kpi{grid-template-columns:repeat(3,minmax(0,1fr))}.kpi>div:nth-child(4){border-left:0;padding-left:0}
.grid{grid-template-columns:minmax(0,1fr);gap:0}.c4,.c5,.c6,.c7{grid-column:auto}.watch{grid-template-columns:1fr}}
@media (max-width:640px){body{padding:0 max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}
.kpi{grid-template-columns:repeat(2,minmax(0,1fr))}.kpi>div{padding:14px 12px 14px 0!important;border-left:0!important}
.kpi>div:nth-child(even){padding-left:12px!important;border-left:1px solid var(--line)!important}.kpi .num{font-size:28px}
.top h1{font-size:24px}td,th{padding:6px 4px}th{letter-spacing:.02em}.num.big{font-size:36px}
.trio{grid-template-columns:1fr 1fr}.trio>div:last-child{grid-column:1/-1}
.since{display:block;margin:0}.feat td:first-child{min-width:120px}}
`;
