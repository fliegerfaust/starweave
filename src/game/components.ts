import type { Card } from '@/core/types';
import { defineComponent } from '@/engine/ecs';

/** Положение в CSS-пикселях экрана, центр объекта. */
export interface Transform {
  x: number;
  y: number;
  rot: number;
  scale: number;
  /** Масштаб по X отдельно — для переворота карты. */
  flip: number;
  alpha: number;
}
export const Transform = defineComponent<Transform>('Transform');

export function transform(x: number, y: number, extra: Partial<Transform> = {}): Transform {
  return { x, y, rot: 0, scale: 1, flip: 1, alpha: 1, ...extra };
}

export enum Layer {
  Background = 0,
  Board = 10,
  BoardCards = 20,
  Effects = 30,
  Hand = 40,
  Dragged = 50,
  Popups = 60,
  /** Цифры подсчёта: свой холст поверх интерфейса (FX.5) — шапка и рука их не закрывают. */
  Overlay = 70,
}

export interface Drawable {
  layer: Layer;
  z: number;
  visible: boolean;
  draw(ctx: CanvasRenderingContext2D, t: Transform): void;
}
export const Drawable = defineComponent<Drawable>('Drawable');

/** Визуальное состояние карты на канвасе. */
export interface CardView {
  card: Card;
  width: number;
  faceUp: boolean;
  hideRank: boolean;
  debuffed: boolean;
  /** 0..1 — подсветка (выбрана, вспыхивает). */
  glow: number;
  glowColor: string;
  /** Подъём над рукой при выборе, px. */
  lift: number;
  /** Где карта живёт сейчас. */
  zone: 'hand' | 'board' | 'flying';
  cell: number;
}
export const CardView = defineComponent<CardView>('CardView');

export interface Particle {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  size: number;
  color: string;
  /** dust — мягкое облачко пыли при приземлении карты (рисуется без «lighter»). */
  kind: 'dot' | 'spark' | 'shard' | 'ring' | 'dust';
  spin: number;
}
export const Particle = defineComponent<Particle>('Particle');

/** Прямоугольник для попадания указателя, центр — Transform. */
export interface Hit {
  w: number;
  h: number;
  enabled: boolean;
}
export const Hit = defineComponent<Hit>('Hit');

/** Сущность исчезнет, когда истечёт время. */
export interface Lifetime {
  left: number;
}
export const Lifetime = defineComponent<Lifetime>('Lifetime');
