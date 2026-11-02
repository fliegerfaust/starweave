/**
 * Правдоподобные тестовые события за 30 дней — чтобы посмотреть сводку до живых игроков.
 * Только для локальной проверки: `node server/scripts/seed-demo.ts /tmp/demo.db`.
 */
import { insertBatch, openDb } from '../src/db.ts';
import type { Batch, Value } from '../src/validate.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: node server/scripts/seed-demo.ts <db>');
const db = openDb(path);

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)]!;
const id = () => `${Math.floor(rnd() * 1e16).toString(16).padStart(14, '0')}-${Math.floor(rnd() * 1e8).toString(16)}`;

const DAY = 86400000;
const now = Date.now();
const steps = ['board', 'hand', 'place1', 'place2', 'place3', 'almost', 'place4', 'formula', 'target', 'combos', 'burn', 'prepare'];
const omens = ['stardust', 'zenith', 'horizon', 'lowTide', 'evenKeel', 'echoes'];
const nights = ['dusk', 'midnight', 'eclipse'];

for (let c = 0; c < 220; c++) {
  const client = `${id()}-c${c}`;
  const platform = pick(['telegram', 'telegram', 'telegram', 'web', 'web', 'yandex']);
  const first = now - Math.floor(rnd() * 30) * DAY - Math.floor(rnd() * DAY);
  const visits = rnd() < 0.35 ? 1 + Math.floor(rnd() * 6) : 1;
  for (let v = 0; v < visits; v++) {
    const start = first + v * DAY * (1 + Math.floor(rnd() * 2));
    if (start > now) break;
    const events: [string, Record<string, Value>, number][] = [];
    let t = start;
    const push = (name: string, params: Record<string, Value>) => events.push([name, params, (t += 20000 + rnd() * 90000)]);
    push('app_open', { platform, lang: 'ru', returning: v > 0 });
    if (v === 0 && rnd() < 0.8) {
      push('tutorial_start', { source: 'offer' });
      const reach = rnd() < 0.6 ? steps.length : Math.floor(rnd() * steps.length);
      steps.slice(0, reach).forEach((step, index) => push('tutorial_step', { step, index }));
      if (reach === steps.length) push('tutorial_complete', {});
      else push('tutorial_skip', { step: steps[reach] ?? 'end', index: reach });
    }
    push('run_start', { sky: 'classic', stake: 0, daily: false });
    let ante = 1;
    let alive = true;
    while (alive && ante <= 8) {
      for (const night of nights) {
        const lossChance = 0.04 + ante * 0.06 + (night === 'eclipse' ? 0.08 : 0);
        const won = rnd() > lossChance;
        push('night_end', { ante, night, boss: '', won, score: 0, target: 0, ratio: won ? 1 + rnd() * 0.6 : 0.5 + rnd() * 0.4, moves_left: won ? Math.floor(rnd() * (10 - ante)) : 0, burns_left: 0, lines: 4 });
        if (!won) {
          alive = false;
          break;
        }
        push('shop_buy', { kind: 'omen', id: pick(omens), price: 5, ante, gold_left: 2 });
        if (rnd() < 0.2) push('guide_open', { focus: '' });
      }
      if (alive) ante++;
    }
    push('run_end', { result: alive ? 'victory' : 'lost', ante: Math.min(ante, 8), nights: 0, lines: 0, best: 0, crosses: 0, omens: '' });
    push('perf', { fps: platform === 'web' ? 60 : 50 + Math.floor(rnd() * 10), dpr: 3, width: 390, height: 800 });
    const batch: Batch = { client, session: `${id()}-s${c}-${v}`, platform, version: '0.3.10', lang: 'ru', events: events.map(([name, params, at]) => ({ name, params, at: Math.min(at, now) })) };
    insertBatch(db, batch);
  }
}
// Новички 0.7.20 (SA.4): короткое обучение с отметками «выполнено», первый забег, первый заход
// в Обсерваторию с «Проводником», вторая глава; и тестовые пачки, которые сводка не считает (SA.1)
const short = ['shortRow', 'shortBurn', 'shortCross', 'reward'];
const guide = ['shopBuy', 'shopSlot', 'shopCharts', 'shopNext'];
for (let c = 0; c < 90; c++) {
  const client = `${id()}-n${c}`;
  const platform = pick(['pikabu', 'pikabu', 'pikabu', 'telegram', 'web']);
  let t = now - Math.floor(rnd() * 6) * DAY - Math.floor(rnd() * DAY);
  const events: [string, Record<string, Value>, number][] = [];
  const push = (name: string, params: Record<string, Value>) => events.push([name, params, (t += 8000 + rnd() * 40000)]);
  push('app_open', { platform, lang: 'ru', returning: false });
  push('tutorial_start', { source: 'auto' });
  const reach = rnd() < 0.65 ? short.length : 1 + Math.floor(rnd() * (short.length - 1));
  short.slice(0, reach).forEach((step, index) => {
    push('tutorial_step', { step, index });
    if (index < reach - 1 || reach === short.length) push('tutorial_step_done', { step, index, ms: Math.round(4000 + rnd() * 30000) });
  });
  if (reach < short.length) {
    push('tutorial_skip', { step: short[reach - 1]!, index: reach - 1 });
    push('app_hide', { ms: Math.round(30000 + rnd() * 60000) });
  } else {
    push('tutorial_complete', {});
    push('run_start', { runs: 0, sky: 'classic', stake: 0, daily: false, gentle: true });
    const won = rnd() < 0.85;
    push('night_end', { ante: 1, night: 'dusk', boss: '', won, score: 0, target: 120, ratio: won ? 1.2 : 0.7, moves_left: 3, burns_left: 1, lines: 4, runs: 0 });
    if (won) {
      push('shop_open', { ante: 1, gold: 9, runs: 0, guide: true });
      const steps = rnd() < 0.8 ? guide.length : 1;
      guide.slice(0, steps).forEach((step, index) => {
        push('shop_guide', { step, index: index + 1 });
        if (step === 'shopBuy' && steps > 1) push('shop_buy', { kind: 'omen', id: pick(omens), price: 6, ante: 1, gold_left: 3 });
      });
      if (steps === 1) push('shop_guide', { step: 'skip', index: 1 });
      if (rnd() < 0.55) push('night_start', { ante: 2, night: 'dusk', boss: '' });
    }
    push('app_hide', { ms: Math.round(120000 + rnd() * 600000) });
  }
  insertBatch(db, { client, session: `${id()}-ns${c}`, platform, version: '0.7.20', lang: 'ru', test: false, events: events.map(([name, params, at]) => ({ name, params, at: Math.min(at, now) })) } as Batch);
  // Вернулся на следующий день
  if (rnd() < 0.2 && t + DAY < now) insertBatch(db, { client, session: `${id()}-nr${c}`, platform, version: '0.7.20', lang: 'ru', test: false, events: [{ name: 'app_open', params: { platform, lang: 'ru', returning: true }, at: t + DAY }] } as Batch);
}
for (let c = 0; c < 6; c++) {
  insertBatch(db, { client: `${id()}-t${c}`, session: `${id()}-ts${c}`, platform: 'web', version: '0.7.20', lang: 'ru', test: true, events: [{ name: 'app_open', params: { platform: 'web', lang: 'ru', returning: false }, at: now - c * 3600000 }, { name: 'tutorial_start', params: { source: 'auto' }, at: now - c * 3600000 + 5000 }] } as Batch);
}
console.log('готово');
