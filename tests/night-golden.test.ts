import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bestMove, shopGreedy } from '../src/core/ai/bot';
import { allContent } from '../src/core/content/pools';
import { SKY_LIST } from '../src/core/content/skies';
import { burnCard, placeCard, startNight } from '../src/core/night';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { GLYPHS, type GameEvent, type RunState } from '../src/core/types';

/**
 * Эталон хода ночи (TD.3): бот играет забеги на всех небах и звёздностях, хэш потока
 * событий и итогового забега сверяется с записанным до разбиения `placeCard` на этапы.
 * Любая перестановка внутри хода (лишний бросок ГПСЧ, другой порядок событий) меняет хэш.
 * Перезаписать эталон: `GOLDEN_WRITE=1 npx vitest run tests/night-golden.test.ts`.
 */
const FIXTURE = new URL('./fixtures/night-golden.json', import.meta.url);

/** События в форме до TD.3: разбитая карта была событием `shatter`. */
function canonical(e: GameEvent): unknown {
  if (e.t === 'cardDestroyed' && e.reason === 'shattered') return { t: 'shatter', cardId: e.cardId, cell: e.cell };
  // Мифы (MY.2) в эталоне выключены: пустой список мифов хода — та же вспышка, что до них
  if (e.t === 'ignite' && e.score.myths.length === 0) {
    const { myths: _myths, ...score } = e.score;
    return { ...e, score };
  }
  return e;
}

/** JSON с ключами по алфавиту: эталону всё равно, в каком порядке поля в объекте. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/**
 * Итоговый забег в форме, не зависящей от версии сохранения и от того, как хранится место в главе: до TD.6 —
 * `nightIndex`, после — `chapter.at` (узлы главы выводятся из правил и в эталон не входят).
 */
function canonicalRun(run: RunState): string {
  // Версия сохранения растёт вместе с форматом (TD.6: 1 → 2) — ход ночи от неё не зависит
  // Снимок открытий (TD.8) в эталоне — весь контент, как и до него; хэш его не включает
  // Журнал пути (RT.3) — запись о главах, не ход ночи; в эталон не входит
  const { chapter, nightIndex, version: _version, pending, unlocks: _unlocks, journey: _journey, ...rest } = run as RunState & { chapter?: { at: number }; nightIndex?: number; pending?: unknown[] };
  // Пустая очередь выборов (TD.7) — то же, что «пакет не открыт» до неё
  return stable({ ...rest, at: chapter?.at ?? nightIndex, ...(pending?.length ? { pending } : {}) });
}

function play(seed: number, skyId: string, stake: number, glyphs = false): { hash: string; kinds: Record<string, number> } {
  const h = createHash('sha256');
  const kinds: Record<string, number> = {};
  const log = (events: GameEvent[]) => {
    for (const e of events) {
      kinds[e.t] = (kinds[e.t] ?? 0) + 1;
      h.update(JSON.stringify(canonical(e)));
    }
  };
  // Эталон — ход ночи без дара и тел (GF): с ними меняется колода, а этапы хода — нет
  const run = newRun({ seed, skyId, stake, unlocks: { ...allContent(), gift: false, bodies: [], routes: false, wonders: false, trophies: false, myths: false, resonance: false } });
  // Каждая третья карта — с глифом: Стекло бьётся, Эхо перезапускает, Позолота даёт золото
  if (glyphs) run.deck.forEach((c, i) => i % 3 === 0 && (c.glyph = GLYPHS[(i / 3) % GLYPHS.length]));
  let guard = 0;
  while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 400) {
    if (run.phase === 'map') log(startNight(run));
    while (run.phase === 'night' && run.night?.result === 'playing') {
      const move = bestMove(run, 0);
      if (!move) break;
      log(move.value < 5 && run.night.burnsLeft > 0 ? burnCard(run, move.handIndex) : placeCard(run, move.handIndex, move.cell));
    }
    if (run.phase === 'reward') collectReward(run);
    if (run.phase === 'shop') {
      shopGreedy(run);
      leaveShop(run);
    }
  }
  expect(run.unlocks, 'эталон играет со всем контентом, кроме дара').toEqual({ ...allContent(), gift: false, bodies: [], routes: false, wonders: false, trophies: false, myths: false, resonance: false });
  h.update(canonicalRun(run));
  return { hash: h.digest('hex'), kinds };
}

describe('эталон хода ночи', () => {
  it('забеги бота совпадают с записанными', () => {
    const hashes: Record<string, string> = {};
    const kinds: Record<string, number> = {};
    for (const sky of SKY_LIST) {
      for (let i = 1; i <= 3; i++) {
        const key = `${sky.id}/${i}`;
        const r = play(i * 7919, sky.id, i % 4);
        hashes[key] = r.hash;
        for (const [k, n] of Object.entries(r.kinds)) kinds[k] = (kinds[k] ?? 0) + n;
      }
    }
    for (let i = 1; i <= 4; i++) {
      const r = play(i * 104729, 'classic', 0, true);
      hashes[`glyphs/${i}`] = r.hash;
      for (const [k, n] of Object.entries(r.kinds)) kinds[k] = (kinds[k] ?? 0) + n;
    }
    // Эталон что-то значит, только если в нём есть вспышки, золото и разбитые карты
    expect(kinds.ignite).toBeGreaterThan(100);
    expect(kinds.gold).toBeGreaterThan(10);
    expect(kinds.shatter ?? kinds.cardDestroyed ?? 0).toBeGreaterThan(0);
    if (process.env.GOLDEN_WRITE || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(hashes, null, 1)}\n`);
    expect(hashes).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  }, 30_000);
});
