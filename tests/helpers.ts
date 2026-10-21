import type { Card, Suit } from '../src/core/types';

let nextId = 10_000;

/** `c('7s')` — 7 Солнца; масти: s=sun, m=moon, t=star, c=comet. Суффикс `*glyph` — глиф. */
export function c(code: string): Card {
  const [body, glyph] = code.split('*') as [string, string | undefined];
  const rank = Number(body.slice(0, -1));
  const suit = ({ s: 'sun', m: 'moon', t: 'star', c: 'comet' } as Record<string, Suit>)[body.slice(-1)];
  if (!suit || !rank) throw new Error(`плохой код карты ${code}`);
  const card: Card = { id: nextId++, suit, rank };
  if (glyph) card.glyph = glyph as Card['glyph'];
  return card;
}

export const cards = (codes: string) => codes.trim().split(/\s+/).map(c);

import { newRun } from '../src/core/run';
import { startNight } from '../src/core/night';
import { createOmen } from '../src/core/omen-instance';
import { planChapter } from '../src/core/route';
import type { RunState } from '../src/core/types';

/** Забег на начале ночи с заданными Знамениями. Рука и небо — по желанию теста. */
export function nightRun(opts: { omens?: string[]; seed?: number; nightIndex?: number; boss?: string } = {}): RunState {
  const run = newRun({ seed: opts.seed ?? 1 });
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
