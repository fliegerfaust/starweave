import type { Unlock } from './skies';
import { COMBO_FAMILY } from './combos';
import type { EffectHooks } from '../effects';
import { cardSuits } from '../deck';
import { isCorner } from '../grid';
import { chance, pick } from '../rng';
import { COMBO_IDS, GLYPHS, type ComboId, type Suit } from '../types';
import { MYTHS_UNLOCK } from './myths';
import { RESONANCE_UNLOCK, RESONANCES } from './resonance';
import { registry } from './registry';

export type Rarity = 1 | 2 | 3;

/** Что Знамение делает со счётом — для значка и объяснения порядка. */
export type OmenKind = 'light' | 'mult' | 'xmult' | 'rule' | 'gold';

export interface OmenDef extends EffectHooks {
  id: string;
  rarity: Rarity;
  price: number;
  kind: OmenKind;
  /** Начальное состояние накопительных Знамений. */
  initialData?(): Record<string, number>;
  /** Живые значения для подстановки в описание: `{x}` и т.п. */
  vars?(data: Record<string, number>): Record<string, string | number>;
  /** Связанные масти/созвездия — для цвета сигила и подсказок. */
  tags?: { suit?: Suit; combo?: ComboId };
  /** Как открыть (TD.8); без него — открыто сразу. Небосвод 0.7 раздаст это поле. */
  unlock?: Unlock;
  /** Про мифы (MY.5): в Обсерватории только в забеге, где мифы открыты. */
  myths?: true;
  /** Легендарное Резонанса (RS.1): из чего слито. Не продаётся и не выпадает — только слиянием. */
  pair?: readonly [string, string];
}

const strength = (combo: ComboId) => COMBO_IDS.indexOf(combo);

const suitOmen = (id: string, suit: Suit, effect: 'mult' | 'light' | 'both' | 'rank'): OmenDef => ({
  id,
  rarity: 1,
  price: 5,
  kind: effect === 'light' || effect === 'rank' ? 'light' : 'mult',
  tags: { suit },
  onCardScored(ctx) {
    if (!cardSuits(ctx.card).includes(suit)) return;
    if (effect === 'mult') ctx.mult(3);
    else if (effect === 'light') ctx.light(25);
    else if (effect === 'rank') ctx.light(ctx.card.rank * 3);
    else {
      ctx.light(10);
      ctx.mult(2);
    }
  },
});

const comboOmen = (id: string, family: ComboId[], mult: number, price = 5, rarity: Rarity = 1): OmenDef => ({
  id,
  rarity,
  price,
  kind: 'mult',
  tags: { combo: family[0] as ComboId },
  onLineScored(ctx) {
    if (family.includes(ctx.combo)) ctx.mult(mult);
  },
});

export const OMEN_LIST: OmenDef[] = [
  // ── Обычные ──────────────────────────────────────────────────────────────
  suitOmen('sunWorship', 'sun', 'mult'),
  suitOmen('moonTide', 'moon', 'light'),
  suitOmen('starlight', 'star', 'both'),
  suitOmen('cometTrail', 'comet', 'rank'),
  comboOmen('twinStars', COMBO_FAMILY.pairs, 8),
  comboOmen('tripod', COMBO_FAMILY.sets, 12),
  comboOmen('ladder', COMBO_FAMILY.runs, 10),
  comboOmen('monochrome', COMBO_FAMILY.flushes, 10),
  {
    id: 'lowTide',
    rarity: 1,
    price: 4,
    kind: 'light',
    onCardScored(ctx) {
      if (ctx.card.rank <= 3) ctx.light(15);
    },
  },
  {
    id: 'highNoon',
    rarity: 1,
    price: 5,
    kind: 'mult',
    onCardScored(ctx) {
      if (ctx.card.rank >= 7) ctx.mult(2);
    },
  },
  {
    id: 'horizon',
    rarity: 1,
    price: 4,
    kind: 'mult',
    onLineScored(ctx) {
      if (ctx.line.kind === 'row') ctx.mult(6);
    },
  },
  {
    id: 'pillar',
    rarity: 1,
    price: 4,
    kind: 'mult',
    onLineScored(ctx) {
      if (ctx.line.kind === 'col') ctx.mult(6);
    },
  },
  {
    id: 'stardust',
    rarity: 1,
    price: 4,
    kind: 'mult',
    onLineScored(ctx) {
      ctx.mult(4);
    },
  },
  {
    id: 'scatterbrain',
    rarity: 1,
    price: 4,
    kind: 'mult',
    onLineScored(ctx) {
      if (ctx.combo === 'scatter') {
        ctx.light(50);
        ctx.mult(5);
      }
    },
  },
  {
    id: 'binary',
    rarity: 1,
    price: 5,
    kind: 'mult',
    onLineScored(ctx) {
      if (new Set(ctx.cards.map((c) => c.suit)).size === 2) ctx.mult(7);
    },
  },
  {
    id: 'abacus',
    rarity: 1,
    price: 5,
    kind: 'rule',
    modifyRules(rules) {
      rules.moves += 3;
    },
  },
  {
    id: 'pyre',
    rarity: 1,
    price: 4,
    kind: 'rule',
    modifyRules(rules) {
      rules.burns += 2;
    },
  },
  {
    id: 'ember',
    rarity: 1,
    price: 5,
    kind: 'mult',
    initialData: () => ({ burns: 0 }),
    vars: (d) => ({ x: (d.burns ?? 0) * 3 }),
    onNightStart(ctx) {
      ctx.data.burns = 0;
    },
    onBurn(ctx) {
      ctx.data.burns = (ctx.data.burns ?? 0) + 1;
    },
    onLineScored(ctx) {
      if (ctx.data.burns) ctx.mult(ctx.data.burns * 3);
    },
  },
  {
    id: 'miser',
    rarity: 1,
    price: 5,
    kind: 'gold',
    modifyRules(rules) {
      rules.interestCap += 5;
    },
  },

  // ── Необычные ────────────────────────────────────────────────────────────
  {
    id: 'evenKeel',
    rarity: 2,
    price: 6,
    kind: 'xmult',
    onLineScored(ctx) {
      if (ctx.cards.every((c) => c.rank % 2 === 0)) ctx.xMult(2);
    },
  },
  {
    id: 'oddity',
    rarity: 2,
    price: 6,
    kind: 'xmult',
    onLineScored(ctx) {
      if (ctx.cards.every((c) => c.rank % 2 === 1)) ctx.xMult(2);
    },
  },
  {
    id: 'crossroads',
    rarity: 2,
    price: 7,
    kind: 'xmult',
    modifyRules(rules) {
      rules.chainBonus += 1;
    },
  },
  {
    id: 'diagonalSight',
    rarity: 2,
    price: 7,
    kind: 'rule',
    modifyRules(rules) {
      rules.diagonals = true;
    },
  },
  {
    id: 'cornerstone',
    rarity: 2,
    price: 7,
    kind: 'rule',
    retriggers(ctx) {
      return isCorner(ctx.cell, ctx.rules.gridSize) ? 1 : 0;
    },
  },
  {
    id: 'momentum',
    rarity: 2,
    price: 6,
    kind: 'mult',
    initialData: () => ({ streak: 0 }),
    vars: (d) => ({ x: ((d.streak ?? 0) + 1) * 2 }),
    onNightStart(ctx) {
      ctx.data.streak = 0;
    },
    onLineScored(ctx) {
      ctx.mult(((ctx.data.streak ?? 0) + 1) * 2);
    },
    onIgnite(ctx) {
      ctx.data.streak = (ctx.data.streak ?? 0) + 1;
    },
    onQuietPlacement(ctx) {
      ctx.data.streak = 0;
    },
  },
  {
    id: 'patientSky',
    rarity: 2,
    price: 6,
    kind: 'mult',
    onLineScored(ctx) {
      if (ctx.night.movesLeft > 0) ctx.mult(ctx.night.movesLeft);
    },
  },
  {
    id: 'nightOwl',
    rarity: 2,
    price: 6,
    kind: 'xmult',
    onPlacementScored(ctx) {
      if (ctx.lastMove) ctx.xMult(3);
    },
  },
  {
    id: 'prismLens',
    rarity: 2,
    price: 7,
    kind: 'rule',
    modifyRules(rules) {
      rules.flushSlack += 1;
    },
  },
  {
    id: 'shortcut',
    rarity: 2,
    price: 7,
    kind: 'rule',
    modifyRules(rules) {
      rules.straightGaps += 1;
    },
  },
  {
    id: 'wideSky',
    rarity: 2,
    price: 7,
    kind: 'rule',
    modifyRules(rules) {
      rules.handSize += 1;
    },
  },
  {
    id: 'tithe',
    rarity: 2,
    price: 6,
    kind: 'gold',
    onLineScored(ctx) {
      if (strength(ctx.combo) >= strength('straight')) ctx.gold(1);
    },
  },
  {
    id: 'constellationMap',
    rarity: 2,
    price: 7,
    kind: 'mult',
    vars: () => ({}),
    onLineScored(ctx) {
      const levels = Object.values(ctx.run.comboLevels).reduce((s, l) => s + (l - 1), 0);
      if (levels > 0) ctx.mult(levels * 2);
    },
  },
  {
    id: 'echoChamber',
    rarity: 2,
    price: 7,
    kind: 'rule',
    retriggers(ctx) {
      return ctx.night.ignitions === 0 ? 1 : 0;
    },
  },
  {
    id: 'hoarder',
    rarity: 2,
    price: 6,
    kind: 'mult',
    onLineScored(ctx) {
      const bonus = Math.floor(ctx.run.gold / 3);
      if (bonus > 0) ctx.mult(bonus);
    },
  },
  {
    id: 'rainbow',
    rarity: 2,
    price: 6,
    kind: 'xmult',
    onLineScored(ctx) {
      if (new Set(ctx.cards.map((c) => c.suit)).size >= 4) ctx.xMult(2);
    },
  },
  {
    id: 'alchemist',
    rarity: 2,
    price: 7,
    kind: 'rule',
    onNightEnd(ctx) {
      if (!ctx.won) return;
      const plain = ctx.run.deck.filter((c) => !c.glyph);
      if (plain.length === 0) return;
      pick(ctx.rng, plain).glyph = pick(ctx.rng, GLYPHS);
    },
  },
  {
    id: 'gambler',
    rarity: 2,
    price: 6,
    kind: 'xmult',
    onCardScored(ctx) {
      if (ctx.card.rank === 7 && chance(ctx.rng, 0.5)) ctx.xMult(1.5);
    },
  },

  // ── Редкие ───────────────────────────────────────────────────────────────
  {
    id: 'glassCannon',
    rarity: 3,
    price: 10,
    kind: 'xmult',
    modifyRules(rules) {
      rules.handSize -= 1;
    },
    onLineScored(ctx) {
      ctx.xMult(3);
    },
  },
  {
    id: 'supernovaSeed',
    rarity: 3,
    price: 10,
    kind: 'xmult',
    onLineScored(ctx) {
      if (COMBO_FAMILY.runs.includes(ctx.combo)) ctx.xMult(3);
    },
  },
  {
    id: 'collapsar',
    rarity: 3,
    price: 10,
    kind: 'xmult',
    initialData: () => ({ lines: 0 }),
    vars: (d) => ({ x: (1 + (d.lines ?? 0) * 0.05).toFixed(2) }),
    onLineScored(ctx) {
      const x = 1 + (ctx.data.lines ?? 0) * 0.05;
      if (x > 1) ctx.xMult(x);
    },
    onIgnite(ctx) {
      ctx.data.lines = (ctx.data.lines ?? 0) + ctx.lines.length;
    },
  },
  {
    id: 'corona',
    rarity: 3,
    price: 9,
    kind: 'xmult',
    onLineScored(ctx) {
      if (ctx.night.kind === 'eclipse') ctx.xMult(2.5);
    },
  },
  {
    id: 'doubleStar',
    rarity: 3,
    price: 10,
    kind: 'xmult',
    onPlacementScored(ctx) {
      if (ctx.lines.length >= 2) ctx.xMult(2);
    },
  },

  // ── Мифы (MY.5): в конце списка, чтобы броски лавки без мифов не сдвинулись ─────
  {
    id: 'astrologer',
    rarity: 2,
    price: 7,
    kind: 'mult',
    myths: true,
    unlock: MYTHS_UNLOCK,
    initialData: () => ({ myths: 0 }),
    vars: (d) => ({ x: 2 + (d.myths ?? 0) }),
    onMythScored(ctx) {
      ctx.mult(2 + (ctx.data.myths ?? 0));
    },
    onIgnite(ctx) {
      ctx.data.myths = (ctx.data.myths ?? 0) + ctx.myths.length;
    },
  },
  {
    id: 'stargazer',
    rarity: 1,
    price: 5,
    kind: 'rule',
    myths: true,
    unlock: MYTHS_UNLOCK,
    modifyRules(rules) {
      rules.mythHint = 2;
    },
    onMythScored(ctx) {
      ctx.light(30);
    },
  },
  {
    id: 'legend',
    rarity: 3,
    price: 9,
    kind: 'rule',
    myths: true,
    unlock: MYTHS_UNLOCK,
    cellFate(ctx) {
      return ctx.myth ? 'stays' : undefined;
    },
  },

  // ── Легендарные Резонанса (RS.1): только слиянием пары, в лавку не попадают ──────
  ...legendaries(),
];

/** Легендарные Знамения: свойства обоих в паре, сильнее каждого; цена — для продажи. */
function legendaries(): OmenDef[] {
  const pairOf = (id: string) => RESONANCES.find((r) => r.id === id)!.pair;
  const legend = (id: string, kind: OmenKind, hooks: Omit<OmenDef, 'id' | 'rarity' | 'price' | 'kind'>): OmenDef => ({ id, rarity: 3, price: 14, kind, unlock: RESONANCE_UNLOCK, pair: pairOf(id), ...hooks });
  return [
    legend('noon', 'xmult', {
      onCardScored(ctx) {
        const sun = cardSuits(ctx.card).includes('sun');
        const high = ctx.card.rank >= 7;
        if (sun && high) {
          ctx.mult(6);
          ctx.xMult(1.5);
        } else if (sun) ctx.mult(3);
        else if (high) ctx.mult(2);
      },
    }),
    legend('starKnot', 'xmult', {
      modifyRules(rules) {
        rules.chainBonus += 1;
      },
      onPlacementScored(ctx) {
        if (ctx.lines.length >= 2) ctx.xMult(4);
      },
    }),
    legend('midnightOwl', 'xmult', {
      onLineScored(ctx) {
        if (ctx.night.movesLeft > 0) ctx.mult(ctx.night.movesLeft);
      },
      onPlacementScored(ctx) {
        if (ctx.lastMove) ctx.xMult(3);
        else if (ctx.night.movesLeft <= 2) ctx.xMult(2);
      },
    }),
    legend('springTide', 'light', {
      onCardScored(ctx) {
        if (cardSuits(ctx.card).includes('moon') || ctx.card.rank <= 3) ctx.light(40);
      },
    }),
    legend('milkyWay', 'xmult', {
      modifyRules(rules) {
        rules.straightGaps += 1;
      },
      onLineScored(ctx) {
        if (COMBO_FAMILY.runs.includes(ctx.combo)) {
          ctx.mult(10);
          ctx.xMult(2);
        }
      },
    }),
    legend('pureSpectrum', 'mult', {
      modifyRules(rules) {
        rules.flushSlack += 1;
      },
      onLineScored(ctx) {
        if (COMBO_FAMILY.flushes.includes(ctx.combo)) ctx.mult(15);
      },
    }),
    legend('wildfire', 'mult', {
      initialData: () => ({ burns: 0 }),
      vars: (d) => ({ x: (d.burns ?? 0) * 5 }),
      modifyRules(rules) {
        rules.burns += 2;
      },
      onNightStart(ctx) {
        ctx.data.burns = 0;
      },
      onBurn(ctx) {
        ctx.data.burns = (ctx.data.burns ?? 0) + 1;
      },
      onLineScored(ctx) {
        if (ctx.data.burns) ctx.mult(ctx.data.burns * 5);
      },
    }),
    legend('treasury', 'mult', {
      modifyRules(rules) {
        rules.interestCap += 10;
      },
      onLineScored(ctx) {
        const bonus = Math.floor(ctx.run.gold / 2);
        if (bonus > 0) ctx.mult(bonus);
      },
    }),
  ];
}

export const OMENS: Record<string, OmenDef> = registry(OMEN_LIST);

export function omenDef(id: string): OmenDef {
  const def = OMENS[id];
  if (!def) throw new Error(`Неизвестное Знамение: ${id}`);
  return def;
}
