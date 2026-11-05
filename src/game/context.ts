import type { Synth } from '@/engine/audio';
import type { Haptics } from '@/engine/haptics';
import type { World } from '@/engine/ecs';
import type { PointerInput } from '@/engine/input';
import type { Renderer } from '@/engine/renderer';
import type { Tweener } from '@/engine/tween';
import type { GlFx } from './night/gl-fx';
import type { Starfield } from './starfield';

export interface Camera {
  shakeX: number;
  shakeY: number;
  /** 0..1, затухает со временем; смещение ~ trauma². */
  trauma: number;
  /** Наезд камеры сверх единицы (0,04 — на 4 %), затухает сам. */
  zoom: number;
  focusX: number;
  focusY: number;
}

/** Характер удара (витрина IM.1): `none` — как в игре сейчас. */
export type ImpactKind = 'none' | 'cosmos';

export interface Resources {
  renderer: Renderer;
  tweens: Tweener;
  camera: Camera;
  time: number;
  /** Множитель скорости анимаций из настроек. */
  speed: number;
  reduceMotion: boolean;
  dpr: number;
  /** Сколько секунд время почти стоит: момент удара. */
  hold: number;
  /** Слой шейдеров; нет слоя — эффекты прежние. */
  gl: GlFx | null;
  impact: ImpactKind;
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
