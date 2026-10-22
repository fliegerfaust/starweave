import type { Card, Suit } from '../src/core/types';

let nextId = 10_000;

/**
 * `c('7s')` — 7 Солнца; масти: s=sun, m=moon, t=star, c=comet. Суффикс `*glyph` — глиф,
 * `@body` — небесное тело (`5s@polaris`).
 */
export function c(code: string): Card {
  const [face, bodyId] = code.split('@') as [string, string | undefined];
  const [body, glyph] = face.split('*') as [string, string | undefined];
  const rank = Number(body.slice(0, -1));
  const suit = ({ s: 'sun', m: 'moon', t: 'star', c: 'comet' } as Record<string, Suit>)[body.slice(-1)];
  if (!suit || !rank) throw new Error(`плохой код карты ${code}`);
  const card: Card = { id: nextId++, suit, rank };
  if (glyph) card.glyph = glyph as Card['glyph'];
  if (bodyId) card.body = bodyId as Card['body'];
  return card;
}

export const cards = (codes: string) => codes.trim().split(/\s+/).map(c);

import { allContent } from '../src/core/content/pools';
import { newRun } from '../src/core/run';
import { startNight } from '../src/core/night';
import { createOmen } from '../src/core/omen-instance';
import { planChapter } from '../src/core/route';
import type { RunState } from '../src/core/types';

/** Весь контент, но глава — цепочка из трёх ночей, без развилок (RT.1): для тестов одной ночи. */
export const LINEAR = { ...allContent(), routes: false };

/** Забег на начале ночи с заданными Знамениями. Рука и небо — по желанию теста. */
export function nightRun(opts: { omens?: string[]; seed?: number; nightIndex?: number; boss?: string } = {}): RunState {
  // Цепочка из трёх ночей: `nightIndex` — номер ночи главы, как до развилок (RT.1)
  const run = newRun({ seed: opts.seed ?? 1, unlocks: LINEAR });
  for (const id of opts.omens ?? []) run.omens.push(createOmen(run, id));
  if (opts.boss) run.bosses[0] = opts.boss;
  // План главы строится из Затмений забега — после подмены его строим заново
  run.chapter = { ...planChapter(run), at: opts.nightIndex ?? 0 };
  startNight(run);
  return run;
}

/** Кладёт карты на небо напрямую (без ходов). `layout` — { клетка: код }. */
export function setGrid(run: RunState, layout: Record<number, string>): void {
  for (const [cell, code] of Object.entries(layout)) run.night!.grid[Number(cell)] = c(code);
}

/** Подменяет руку. */
export function setHand(run: RunState, codes: string): void {
  run.night!.hand = cards(codes);
}
