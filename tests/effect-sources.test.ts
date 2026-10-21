import { afterEach, describe, expect, it } from 'vitest';
import { EFFECT_SOURCES, activeEffects } from '../src/core/effect-sources';
import { placeCard } from '../src/core/night';
import type { GameEvent } from '../src/core/types';
import { nightRun, setGrid, setHand } from './helpers';

const ignite = (events: GameEvent[]) => events.find((e) => e.t === 'ignite') as Extract<GameEvent, { t: 'ignite' }>;
const saved = [...EFFECT_SOURCES];
afterEach(() => EFFECT_SOURCES.splice(0, EFFECT_SOURCES.length, ...saved));

describe('источники эффектов (TD.5)', () => {
  it('Знамения по слотам, затем Затмение; вне ночи Затмения нет', () => {
    const run = nightRun({ omens: ['stardust', 'miser'], nightIndex: 2, boss: 'eclipse-sun' });
    const kinds = activeEffects(run, run.night).map((fx) => (fx.source.kind === 'omen' ? fx.source.omenId : fx.source.kind));
    expect(kinds).toEqual(['stardust', 'miser', 'boss']);
    expect(activeEffects(run, null).map((fx) => fx.source.kind)).toEqual(['omen', 'omen']);
  });

  it('новый источник в реестре участвует в подсчёте без правок ядра', () => {
    const play = () => {
      const run = nightRun();
      setGrid(run, { 0: '3s', 1: '3m', 2: '7t' });
      setHand(run, '9c');
      return ignite(placeCard(run, 0, 3)).score;
    };
    const before = play();
    // Будущий трофей: ×2 ко всему ходу, подпись — как у Затмения, которое его дало
    EFFECT_SOURCES.push({
      id: 'trophy',
      collect: () => [{ hooks: { onPlacementScored: (ctx) => ctx.xMult(2) }, data: {}, source: { kind: 'boss', bossId: 'void' } }],
    });
    const after = play();
    expect(after.total).toBe(before.total * 2);
    expect(after.steps.at(-1)).toMatchObject({ source: { kind: 'boss', bossId: 'void' }, xMult: 2 });
  });
});
