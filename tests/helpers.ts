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
