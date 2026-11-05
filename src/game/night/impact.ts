import type { ComboId, PlacementScore } from '@/core/types';
import type { GameWorld } from '../context';
import { shake } from '../fx';
import type { FocusFx, FxLook, GlFx, ThreadFx } from './gl-fx';
import type { NightScene } from './scene';

type Pt = { x: number; y: number };

/** Цвета масти для удара. */
export interface Hue {
  main: string;
  light: string;
}

/** Сильные комбинации: им положена чёрная дыра (выбор Дениса, IM.1). */
const GRAND_COMBOS: ReadonlySet<ComboId> = new Set<ComboId>(['quartet', 'starFlush', 'supernova']);

/**
 * Обычная линия рассыпается в пыль сверхновой. Чёрная дыра остаётся событием: сильная
 * комбинация, крест или миф.
 */
export function moveLook(score: Pick<PlacementScore, 'lines' | 'myths'>): FxLook {
  const grand = score.myths.length > 0 || score.lines.length > 1 || score.lines.some((l) => GRAND_COMBOS.has(l.combo));
  return grand ? 'hole' : 'nova';
}

/**
 * Удар на шейдерах (витрина IM.1): космос вместо огня, на каждый момент один проработанный
 * эффект. Пока слоя нет (`?impact` не задан или WebGL2 недоступен), ночь идёт как раньше.
 */
export class Impact {
  private threads: ThreadFx[] = [];
  private dim: FocusFx | null = null;
  private look: FxLook = 'nova';

  constructor(
    private readonly world: GameWorld,
    private readonly scene: NightScene,
    private readonly speed: () => number,
  ) {}

  private get gl(): GlFx | null {
    return this.world.res.gl;
  }

  get on(): boolean {
    return this.gl !== null;
  }

  private get cardW(): number {
    return this.scene.layout.cardW;
  }

  private get reach(): number {
    const { board } = this.scene.layout;
    return Math.hypot(board.w, board.h);
  }

  /** Время почти останавливается на вершине удара. */
  private hold(seconds: number): void {
    if (this.world.res.reduceMotion) return;
    this.world.res.hold = Math.max(this.world.res.hold, seconds / this.speed());
  }

  private punch(amount: number, at: Pt): void {
    if (this.world.res.reduceMotion) return;
    const cam = this.world.res.camera;
    cam.zoom = Math.max(cam.zoom, amount);
    cam.focusX = at.x;
    cam.focusY = at.y;
  }

  /** Ход начал считаться: его сила решает характер удара. */
  begin(score: PlacementScore): void {
    this.look = moveLook(score);
    this.gl?.setLook(this.look);
  }

  /** Карта легла: короткий всплеск у её низа. */
  land(p: Pt, hue: Hue): void {
    this.gl?.setLook('nova');
    this.gl?.glint(p, this.cardW * 1.5, hue.light, 0.4, 0.7);
    this.gl?.sparks(p, { x: this.cardW * 0.45, y: this.scene.layout.cardH * 0.45 }, 24, hue.light, 0.8, 5, 0.5);
  }

  /** Линия начинает гореть: мир гаснет вокруг неё, по картам идёт нить. */
  lineStart(pts: readonly Pt[], color: string, duration: number): void {
    const { gl } = this;
    if (!gl) return;
    const { cardW, cardH } = this.scene.layout;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs) - cardW * 0.6;
    const y = Math.min(...ys) - cardH * 0.6;
    const rect = { x, y, w: Math.max(...xs) + cardW * 0.6 - x, h: Math.max(...ys) + cardH * 0.6 - y };
    if (this.dim) this.dim.add(rect);
    else this.dim = gl.focus(rect, 0.58);
    this.threads.push(gl.thread(pts, color, duration, cardW * 0.62));
  }

  /** Искра дошла до карты. */
  ignite(p: Pt, hue: Hue): void {
    const { gl } = this;
    if (!gl) return;
    gl.glint(p, this.cardW * 2.1, hue.light, 0.5);
    gl.sparks(p, { x: this.cardW * 0.35, y: this.cardW * 0.45 }, 30, hue.light, 1, 5.5);
  }

  /** Линия замкнулась. */
  line(center: Pt, color: string): void {
    const { gl } = this;
    if (!gl) return;
    this.threads.at(-1)?.pulse();
    this.hold(0.05);
    this.punch(0.012, center);
    shake(this.world, 0.1);
    gl.ring(center, this.reach * 0.46, color, 0.75);
  }

  /** Шаг подсчёта: только щепотка искр, главное здесь цифра. */
  step(at: Pt, color: string): void {
    this.gl?.sparks(at, { x: 6, y: 6 }, 10, color, 0.6, 4.5, 0.5);
  }

  /** Итог хода влетел в счёт: один большой удар. */
  final(center: Pt, pts: readonly Pt[], hues: readonly string[], power: number): void {
    const { gl } = this;
    if (!gl) return;
    const p = 0.4 + power * 0.6;
    const color = hues[0] ?? '#ffd98a';
    this.hold(0.07 + p * 0.05);
    this.punch(0.018 + p * 0.016, center);
    shake(this.world, 0.16 + p * 0.2);
    this.dim?.release(0.3);
    this.dim = null;
    const hole = this.look === 'hole';
    gl.wave(this.scene.svc.renderer.canvas, center, this.reach * (hole ? 0.8 : 0.95), hole ? 1.6 : 0.8, 0.6 + p * 0.5);
    gl.finale(center, this.reach * (0.66 + p * 0.3), color, 1);
    pts.forEach((pt, i) => gl.sparks(pt, { x: this.cardW * 0.4, y: this.cardW * 0.5 }, 26 + Math.round(p * 20), hues[i % hues.length] ?? color, 1.4, 5.5));
    for (const t of this.threads) t.fade(0.55);
    this.threads = [];
  }
}
