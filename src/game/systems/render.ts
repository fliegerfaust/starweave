import type { Entity, System } from '@/engine/ecs';
import { Drawable, Layer, Transform } from '../components';
import type { Resources } from '../context';

/**
 * Рисует все Drawable по слоям, учитывая тряску камеры. Фон не трясётся. Слой Overlay — на
 * отдельном холсте поверх интерфейса (FX.5); он очищается каждый кадр.
 */
export const renderSystem: System<Resources> = {
  name: 'render',
  update(world) {
    const { renderer, camera } = world.res;
    const items: { e: Entity; d: Drawable; t: Transform }[] = [];
    for (const e of world.query(Drawable, Transform)) {
      const d = world.req(e, Drawable);
      if (d.visible) items.push({ e, d, t: world.req(e, Transform) });
    }
    items.sort((a, b) => a.d.layer - b.d.layer || a.d.z - b.d.z || a.e - b.e);
    let ctx = renderer.begin(0, 0);
    let shaken = false;
    let over = false;
    // Наезд держит точку удара на месте: фон не двигается, поле и эффекты бьют на зрителя
    const scale = 1 + camera.zoom;
    const offX = camera.shakeX - camera.focusX * camera.zoom;
    const offY = camera.shakeY - camera.focusY * camera.zoom;
    const top = items[items.length - 1];
    renderer.beginOverlay(offX, offY, scale, !!top && top.d.layer >= Layer.Overlay);
    for (const { d, t } of items) {
      if (!shaken && d.layer > 0) {
        ctx = renderer.begin(offX, offY, scale);
        shaken = true;
      }
      if (!over && d.layer >= Layer.Overlay) {
        ctx = renderer.overlayCtx;
        over = true;
      }
      ctx.save();
      d.draw(ctx, t);
      ctx.restore();
    }
  },
};
