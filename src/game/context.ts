import type { Synth } from '@/engine/audio';
import type { Haptics } from '@/engine/haptics';
import type { World } from '@/engine/ecs';
import type { PointerInput } from '@/engine/input';
import type { Renderer } from '@/engine/renderer';
import type { Tweener } from '@/engine/tween';
import type { Starfield } from './starfield';

export interface Camera {
  shakeX: number;
  shakeY: number;
  /** 0..1, затухает со временем; смещение ~ trauma². */
  trauma: number;
}

export interface Resources {
  renderer: Renderer;
  tweens: Tweener;
  camera: Camera;
  time: number;
  /** Множитель скорости анимаций из настроек. */
  speed: number;
  reduceMotion: boolean;
  dpr: number;
}

export type GameWorld = World<Resources>;

export interface Services {
  world: GameWorld;
  renderer: Renderer;
  tweens: Tweener;
  audio: Synth;
  input: PointerInput;
  starfield: Starfield;
  haptics: Haptics;
}
