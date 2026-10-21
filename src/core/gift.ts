import { GIFT_SKIP_GOLD } from './content/balance';
import { RuleError } from './errors';
import { pick, randInt } from './rng';
import { GLYPHS, MAX_RANK, MIN_RANK, SUITS, type BodyId, type Card, type Glyph, type RunState } from './types';

/**
 * Вариант дара ночи (GF.1): новая звезда в колоду — с глифом или небесное тело — либо
 * «Возвышение» карты колоды на ранг. Новая карта получит id только при взятии.
 */
export type GiftOffer =
  | { k: 'card'; card: Omit<Card, 'id'> }
  | { k: 'ascend'; cardId: number };

/** Сколько вариантов в даре. */
export const GIFT_OPTIONS = 3;

function rollRank(run: RunState): number {
  return MIN_RANK + randInt(run.rng, MAX_RANK - MIN_RANK + 1);
}

function glyphCard(run: RunState, exclude: Glyph[]): GiftOffer {
  const glyph = pick(run.rng, GLYPHS.filter((g) => !exclude.includes(g)));
  return { k: 'card', card: { suit: pick(run.rng, SUITS), rank: rollRank(run), glyph } };
}

function bodyCard(run: RunState, body: BodyId): GiftOffer {
  const suit = pick(run.rng, SUITS);
  // Двойнику нужен следующий ранг — девятки у него не бывает
  const rank = body === 'twin' ? MIN_RANK + randInt(run.rng, MAX_RANK - MIN_RANK) : rollRank(run);
  return { k: 'card', card: { suit, rank, body } };
}

/** Карты, которые Возвышение может поднять: не девятки и не Туманность (у неё любой ранг). */
export function ascendable(run: RunState): Card[] {
  return run.deck.filter((c) => c.rank < MAX_RANK && c.body !== 'nebula');
}

/**
 * Три варианта дара от сида забега: карта с глифом, небесное тело (если тела уже открыты,
 * иначе — ещё глиф) и Возвышение карты колоды (если поднимать нечего — третий глиф).
 */
export function rollGift(run: RunState): GiftOffer[] {
  const first = glyphCard(run, []);
  const used = (o: GiftOffer) => (o.k === 'card' && o.card.glyph ? [o.card.glyph] : []);
  const bodies = run.unlocks.bodies;
  const second = bodies.length ? bodyCard(run, pick(run.rng, bodies)) : glyphCard(run, used(first));
  const pool = ascendable(run);
  const third: GiftOffer = pool.length ? { k: 'ascend', cardId: pick(run.rng, pool).id } : glyphCard(run, [...used(first), ...used(second)]);
  return [first, second, third];
}

/** Взять вариант дара: карта ложится в колоду, Возвышение поднимает ранг. */
export function takeGift(run: RunState, offer: GiftOffer): void {
  if (offer.k === 'card') {
    run.deck.push({ ...offer.card, id: run.nextCardId++ });
    return;
  }
  const card = run.deck.find((c) => c.id === offer.cardId);
  if (!card || card.rank >= MAX_RANK) throw new RuleError('nothing');
  card.rank += 1;
}

/** «Чистое небо»: колода не растёт, золото — в Обсерваторию. */
export function skipGift(run: RunState): void {
  run.gold += GIFT_SKIP_GOLD;
  run.stats.goldEarned += GIFT_SKIP_GOLD;
}
