import { describe, expect, it } from 'vitest';
import { burnCard, placeCard, startNight } from '../src/core/night';
import { collectReward } from '../src/core/run';
import { TUTORIAL_CELLS, applyTutorialNight, cardCode, newTutorialRun } from '../src/core/tutorial';
import type { GameEvent, RunState } from '../src/core/types';

const handIndex = (run: RunState, code: string) => run.night!.hand.findIndex((c) => cardCode(c) === code);
const ignite = (ev: GameEvent[]) => ev.find((e) => e.t === 'ignite') as Extract<GameEvent, { t: 'ignite' }> | undefined;

describe('сценарий обучения', () => {
  it('первая ночь: Пара 56, сжигание, крест флеш + тройка, победа', () => {
    const run = newTutorialRun();
    startNight(run);
    applyTutorialNight(run, 0);
    const codes = ['3s', '3m', '7t', '5c'];
    let last: GameEvent[] = [];
    TUTORIAL_CELLS.pairRow.forEach((cell, i) => {
      last = placeCard(run, handIndex(run, codes[i]!), cell);
    });
    const pair = ignite(last)!;
    expect(pair.score.lines[0]!.combo).toBe('pair');
    expect(pair.score.total).toBe(56);

    expect(cardCode(run.night!.hand[0]!)).toBe('1m');
    burnCard(run, handIndex(run, '1m'));
    for (const step of TUTORIAL_CELLS.crossSetup) {
      const ev = placeCard(run, handIndex(run, step.card), step.cell);
      expect(ignite(ev)).toBeUndefined();
    }
    const cross = ignite(placeCard(run, handIndex(run, TUTORIAL_CELLS.cross.card), TUTORIAL_CELLS.cross.cell))!;
    expect(cross.score.lines.map((l) => l.combo).sort()).toEqual(['flush', 'triple']);
    expect(run.phase).toBe('reward');
  });

  it('вторая ночь начинается с трёх шестёрок', () => {
    const run = newTutorialRun();
    startNight(run);
    applyTutorialNight(run, 0);
    run.night!.score = 999;
    run.phase = 'reward';
    run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    collectReward(run);
    run.phase = 'map';
    run.nightIndex = 1;
    startNight(run);
    applyTutorialNight(run, 1);
    expect(run.night!.hand.map(cardCode)).toEqual(['6s', '6m', '6t', '2c']);
  });
});
