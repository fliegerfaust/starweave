import { describe, expect, it } from 'vitest';
import { FxGuard } from '@/game/night/fx-guard';

const run = (guard: FxGuard, frames: number, ms: number): (number | null)[] => Array.from({ length: frames }, () => guard.frame(ms));

describe('сторож кадров', () => {
  it('не трогает плавный эффект', () => {
    const guard = new FxGuard();
    expect(run(guard, 300, 17).every((r) => r === null)).toBe(true);
    expect(guard.level).toBe(0);
  });

  it('30 кадров режима экономии батареи не считает просадкой', () => {
    const guard = new FxGuard();
    run(guard, 300, 33.4);
    expect(guard.level).toBe(0);
  });

  it('при просадке сначала упрощает, потом выключает', () => {
    const guard = new FxGuard();
    expect(run(guard, 60, 50)).toContain(1);
    expect(guard.level).toBe(1);
    expect(run(guard, 60, 50)).toContain(2);
    expect(guard.level).toBe(2);
    expect(run(guard, 60, 50).every((r) => r === null)).toBe(true);
  });

  it('разовый рывок в начале эффекта не считается', () => {
    const guard = new FxGuard();
    run(guard, 4, 50);
    run(guard, 200, 17);
    expect(guard.level).toBe(0);
  });

  it('редкие рывки среди плавных кадров терпит', () => {
    const guard = new FxGuard();
    for (let i = 0; i < 400; i++) guard.frame(i % 5 === 0 ? 50 : 17);
    expect(guard.level).toBe(0);
  });
});
