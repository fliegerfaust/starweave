import { describe, expect, it } from 'vitest';
import { World, defineComponent } from '../src/engine/ecs';
import { Tweener } from '../src/engine/tween';

const Pos = defineComponent<{ x: number }>('Pos');
const Vel = defineComponent<{ v: number }>('Vel');

describe('ECS', () => {
  it('запросы по нескольким компонентам и удаление', () => {
    const world = new World({});
    const a = world.create();
    const b = world.create();
    world.add(a, Pos, { x: 0 });
    world.add(a, Vel, { v: 2 });
    world.add(b, Pos, { x: 5 });
    world.addSystem({ name: 'move', update: (w, dt) => w.query(Pos, Vel).forEach((e) => (w.req(e, Pos).x += w.req(e, Vel).v * dt)) });
    world.update(1);
    expect(world.req(a, Pos).x).toBe(2);
    expect(world.req(b, Pos).x).toBe(5);
    world.destroy(a);
    expect(world.query(Pos)).toEqual([b]);
    expect(world.has(a, Vel)).toBe(false);
  });
});

describe('Tweener', () => {
  it('доводит значение и резолвит промис, задержка не ломает соседей', async () => {
    const tw = new Tweener();
    const a = { x: 0 };
    const b = { x: 0 };
    let done = false;
    tw.to(a, { x: 10 }, { duration: 1, ease: 'linear' }).then(() => (done = true));
    tw.to(b, { x: 10 }, { duration: 1, ease: 'linear', delay: 0.5 });
    tw.update(0.5);
    expect(a.x).toBeCloseTo(5);
    expect(b.x).toBe(0);
    tw.update(0.5);
    await Promise.resolve();
    expect(a.x).toBe(10);
    expect(b.x).toBeCloseTo(5);
    expect(done).toBe(true);
  });

  it('finishAll мгновенно доводит всё', () => {
    const tw = new Tweener();
    const a = { x: 0, y: 0 };
    tw.to(a, { x: 3, y: 4 }, { duration: 10 });
    tw.finishAll();
    expect(a).toEqual({ x: 3, y: 4 });
    expect(tw.active).toBe(0);
  });
});
