import { LINEAR } from './helpers';
import { describe, expect, it } from 'vitest';
import { bestMove, pickRoute, shopGreedy } from '../src/core/ai/bot';
import { placeCard, previewTurn, startNight } from '../src/core/night';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import type { RunState } from '../src/core/types';

/** Прежний прогноз: полный ход на полной копии забега. */
function fullPreview(run: RunState, hand: number, cell: number, seed: number) {
  const sim = structuredClone(run);
  sim.rng.s = seed;
  const ignite = placeCard(sim, hand, cell).find((e) => e.t === 'ignite');
  return ignite && ignite.t === 'ignite' ? ignite.score : null;
}

describe('прогноз на песочнице (TD.16)', () => {
  it('совпадает с полным ходом на копии и не меняет забег', () => {
    let checked = 0;
    for (const seed of [11, 202, 3003]) {
      const run = newRun({ seed, skyId: seed === 202 ? 'astrolabe' : 'classic', unlocks: LINEAR });
      for (let guard = 0; guard < 200 && run.phase !== 'gameOver' && run.phase !== 'victory'; guard++) {
        if (run.phase === 'map') {
          pickRoute(run);
          startNight(run);
        }
        if (run.phase === 'night' && run.night) {
          const before = JSON.stringify(run);
          const n = run.night;
          for (let h = 0; h < n.hand.length; h++) {
            for (let c = 0; c < n.grid.length; c++) {
              if (n.grid[c] || n.sealed[c]) continue;
              expect(previewTurn(run, h, c, 99)).toEqual(fullPreview(run, h, c, 99));
              checked++;
            }
          }
          expect(JSON.stringify(run)).toBe(before);
          const m = bestMove(run, 0);
          if (!m) break;
          placeCard(run, m.handIndex, m.cell);
        }
        if (run.phase === 'reward') collectReward(run);
        if (run.phase === 'shop') {
          shopGreedy(run);
          leaveShop(run);
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  }, 60_000);

  it('невозможный ход — null, а не ошибка', () => {
    const run = newRun({ seed: 1, unlocks: LINEAR });
    expect(previewTurn(run, 0, 0, 1)).toBeNull();
    startNight(run);
    expect(previewTurn(run, 9, 0, 1)).toBeNull();
    expect(previewTurn(run, 0, 99, 1)).toBeNull();
  });
});
