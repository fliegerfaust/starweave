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
console.log('готово');
