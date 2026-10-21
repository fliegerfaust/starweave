import { traitOf } from './content/traits';
import { type Card, type Glyph, type Suit, MAX_RANK, MIN_RANK, SUITS } from './types';

export interface DeckSpec {
  suits?: readonly Suit[];
  minRank?: number;
  maxRank?: number;
  copies?: number;
}

/** Строит колоду: все сочетания мастей и рангов, `copies` раз. Возвращает карты и следующий id. */
export function buildDeck(spec: DeckSpec, firstId: number): { cards: Card[]; nextId: number } {
  const suits = spec.suits ?? SUITS;
  const minRank = spec.minRank ?? MIN_RANK;
  const maxRank = spec.maxRank ?? MAX_RANK;
  const copies = spec.copies ?? 1;
  const cards: Card[] = [];
  let id = firstId;
  for (let c = 0; c < copies; c++) {
    for (const suit of suits) {
      for (let rank = minRank; rank <= maxRank; rank++) cards.push({ id: id++, suit, rank });
    }
  }
  return { cards, nextId: id };
}

export function cloneCard(card: Card): Card {
  const copy: Card = { id: card.id, suit: card.suit, rank: card.rank };
  if (card.glyph) copy.glyph = card.glyph;
  return copy;
}

export function withGlyph(card: Card, glyph: Glyph | undefined): Card {
  const copy = cloneCard(card);
  if (glyph) copy.glyph = glyph;
  else delete copy.glyph;
  return copy;
}

/** Масти, которые карта «носит» для флеша и Знамений мастей: Призма — все. */
export function cardSuits(card: Card): readonly Suit[] {
  return traitOf(card)?.wildSuit ? SUITS : [card.suit];
}
