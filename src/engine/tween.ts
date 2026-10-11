/** Твины числовых полей любого объекта + промисы для режиссуры анимаций. */

export type Easing = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  inBack: (t: number) => c3 * t * t * t - c1 * t * t,
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
} satisfies Record<string, Easing>;

export type EaseName = keyof typeof ease;

export interface TweenOptions {
  duration: number;
  ease?: EaseName | Easing;
  delay?: number;
  onUpdate?: (t: number) => void;
}

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

interface ActiveTween {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  elapsed: number;
  started: boolean;
  delay: number;
  duration: number;
  ease: Easing;
  onUpdate?: (t: number) => void;
  resolve: () => void;
}

export class Tweener {
  private tweens: ActiveTween[] = [];

  to<T extends object>(target: T, props: Partial<Pick<T, NumericKeys<T>>>, opts: TweenOptions): Promise<void> {
    return new Promise((resolve) => {
      const easing = typeof opts.ease === 'function' ? opts.ease : ease[opts.ease ?? 'outCubic'];
      // Новый твин по тем же полям отменяет старый — иначе они дерутся.
      this.cancelProps(target, Object.keys(props));
      this.tweens.push({
        target: target as unknown as Record<string, number>,
        from: {},
        to: props as Record<string, number>,
        elapsed: 0,
        started: false,
        delay: opts.delay ?? 0,
        duration: Math.max(0.0001, opts.duration),
        ease: easing,
        onUpdate: opts.onUpdate,
        resolve,
      });
    });
  }

  /** Пауза в режиссуре. */
  wait(seconds: number): Promise<void> {
    return this.to({ t: 0 }, { t: 1 }, { duration: seconds, ease: 'linear' });
  }

  cancel(target: object): void {
    this.tweens = this.tweens.filter((tw) => {
      if (tw.target !== target) return true;
      tw.resolve();
      return false;
    });
  }

  private cancelProps(target: object, keys: string[]): void {
    for (const tw of this.tweens) {
      if (tw.target !== target) continue;
      for (const key of keys) {
        delete tw.to[key];
        delete tw.from[key];
      }
    }
  }

  /** Доводит все твины до конца мгновенно (кнопка «пропустить»). */
  finishAll(): void {
    for (const tw of this.tweens) {
      for (const key of Object.keys(tw.to)) tw.target[key] = tw.to[key]!;
      tw.resolve();
    }
    this.tweens = [];
  }

  get active(): number {
    return this.tweens.length;
  }

  update(dt: number): void {
    if (this.tweens.length === 0) return;
    const done: ActiveTween[] = [];
    for (const tw of this.tweens) {
      let step = dt;
      if (tw.delay > 0) {
        tw.delay -= step;
        if (tw.delay > 0) continue;
        step = -tw.delay;
        tw.delay = 0;
      }
      if (!tw.started) {
        tw.started = true;
        for (const key of Object.keys(tw.to)) tw.from[key] = tw.target[key] ?? 0;
      }
      tw.elapsed += step;
      const t = Math.min(1, tw.elapsed / tw.duration);
      const k = tw.ease(t);
      for (const key of Object.keys(tw.to)) {
        const from = tw.from[key]!;
        tw.target[key] = from + (tw.to[key]! - from) * k;
      }
      tw.onUpdate?.(t);
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.tweens = this.tweens.filter((tw) => !done.includes(tw));
      for (const tw of done) tw.resolve();
    }
  }
}
