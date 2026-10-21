import { describe, expect, it } from 'vitest';
import { assertNever } from '../src/core/errors';
import { newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';

describe('полнота фаз (TD.2)', () => {
  it('assertNever бросает с названием и значением', () => {
    expect(() => assertNever('route' as never, 'phase')).toThrow('Unhandled phase: "route"');
  });

  it('каждая известная фаза переживает сохранение', () => {
    // Ночь и лавка требуют своего состояния — их проверяют тесты миграций
    for (const phase of ['map', 'reward', 'gameOver', 'victory'] as const) {
      const run = newRun({ seed: 7 });
      run.phase = phase;
      expect(deserializeRun(serializeRun(run))?.phase).toBe(phase);
    }
  });
});
