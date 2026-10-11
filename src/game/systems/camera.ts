import type { System } from '@/engine/ecs';
import type { Resources } from '../context';

/** Тряска камеры: травма затухает, смещение — шум, пропорциональный травме². */
export const cameraSystem: System<Resources> = {
  name: 'camera',
  update(world, dt) {
    const cam = world.res.camera;
    cam.trauma = Math.max(0, cam.trauma - dt * 1.6);
    const amount = world.res.reduceMotion ? 0 : cam.trauma * cam.trauma * 14;
    const t = world.res.time * 40;
    cam.shakeX = amount * (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5);
    cam.shakeY = amount * (Math.cos(t * 1.7) + Math.sin(t * 3.1) * 0.5);
  },
};
