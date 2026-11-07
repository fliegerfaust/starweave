import { starRadius, type SkyFigure } from '@/art/constellations';
import { starGlow } from '@/art/glow';
import { bossSigil } from '@/art/sigil';
import type { NightState } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import { named, num, t } from '@/i18n';
import { Drawable, Layer, Transform, transform } from '../components';
import { burst, shake } from '../fx';
import { BlackSun, sunLook } from './black-sun';
import { figureFor, goalVariantFor, lightOrder, type GoalVariant } from './goal-plan';
import type { NightScene } from './scene';

type Pt = { x: number; y: number };
type Beam = { from: Pt; to: Pt; age: number; life: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));


/** Вариант ночи; в разработке `?goal=figure|eclipse|now` подменяет его (`now` — без сцены цели). */
export function goalVariant(scene: NightScene): GoalVariant | null {
  const forced = import.meta.env.DEV ? document.documentElement.dataset.goal : undefined;
  if (forced === 'now') return null;
  if (forced === 'figure' || forced === 'eclipse') return forced;
  return goalVariantFor(scene.night.kind);
}

/**
 * Цель на сцене (GO.3): небо отвечает на каждое созвездие, число цели остаётся в табло.
 * Обычная ночь — «Созвездие ночи»: во всё небо пунктир настоящего созвездия, его звёзды
 * загораются по мере счёта, на цели оно сплетено и подписано. Ночь Затмения — «Затмение»:
 * за небом диск с кольцом тени (запас врага), огонь созвездий бьёт в диск, кольцо тает,
 * луна сходит с солнца. Рисуется над туманностью и под клетками; «Меньше движения» убирает
 * лучи и искры, остаётся смена неба.
 */
export class GoalSky {
  /** Показанный прогресс 0…1 (плавно догоняет счёт). */
  shown = 0;
  /** Удар: 1 сразу после попадания, гаснет к 0. */
  hitK = 0;
  /** Финал: 0…1, Затмение отбито / созвездие сплетено. */
  won = 0;
  private beams: Beam[] = [];
  private readonly entity: Entity;
  private readonly figure: SkyFigure;
  private readonly order: number[];
  private readonly calm: boolean;
  /**
   * Затмение — живой противник (GO.4, выбор Дениса 03.11.2026): в начале ночи луна наползает на
   * солнце, на диске проступает знак Затмения, под ним имя, правило и цель; от диска тянутся тени к
   * клеткам, которые оно задело (запечатанные, карты затмённой масти), удар созвездия их отдёргивает;
   * на победе кольцо тени разбивается на жемчужные осколки. Приход 0…1.
   */
  private readonly foe: boolean;
  arrive = 1;
  private shattered = false;
  private readonly bornAt: number;
  private readonly sigil: HTMLCanvasElement | null = null;
  /** Последняя ночь: после победы её уже нет в забеге, а финал на небе ещё догорает под выбором трофея. */
  private last: NightState;
  private get night(): NightState {
    return (this.last = this.scene.run.night ?? this.last);
  }

  constructor(
    private readonly scene: NightScene,
    readonly variant: GoalVariant,
  ) {
    const world = scene.world;
    const run = scene.run;
    this.last = scene.night;
    this.calm = !!world.res.reduceMotion;
    this.figure = figureFor(run.seed, run.ante, scene.night.kind);
    this.order = lightOrder(this.figure);
    this.shown = clamp01(scene.night.score / scene.night.target);
    this.won = this.shown >= 1 ? 1 : 0;
    this.bornAt = world.res.time;
    this.foe = variant === 'eclipse';
    const bossId = scene.night.bossId;
    if (this.foe && bossId) {
      this.sigil = bossSigil(bossId, 96, 2);
      // Затмение приходит: луна наползает на солнце, знак проступает, кольцо тени набирается
      if (this.shown === 0) {
        this.arrive = 0;
        const me: GoalSky = this;
        void scene.svc.tweens.to(me, { arrive: 1 }, { duration: this.calm ? 0.3 : 2.4, ease: 'inOutCubic', delay: 0.4 });
      }
    }
    this.startWar();
    this.entity = world.create();
    world.add(this.entity, Transform, transform(0, 0));
    world.add(this.entity, Drawable, { layer: Layer.Background, z: 1, visible: true, draw: (ctx) => this.draw(ctx, world.res.time) });
  }

  destroy(): void {
    this.scene.world.destroy(this.entity);
    if (this.frontEntity !== null) this.scene.world.destroy(this.frontEntity);
    this.sun?.destroy();
    if (this.sun && this.scene.world.res.gl) this.scene.world.res.gl.ambient = false;
  }

  // ── Витрина IM.3: бой с Затмением ───────────────────────
  /** Чёрное солнце; пока его нет, небо рисуется как раньше. */
  private sun: BlackSun | null = null;
  private lastTime = 0;
  /** Враг перед полем: 0 — за картами, 1 — на первом плане. */
  front = 0;
  /** Отдача от удара: 1 сразу после попадания. */
  kick = 0;
  /** Запас сил на экране: число над диском. */
  private hpShown = 0;
  /** Урон этого хода: одно число растёт с каждой кометой. */
  private dmgShown = 0;
  dmgPop = 0;
  /** Имя врага над диском, пока он приходит. */
  nameK = 0;
  private frontEntity: Entity | null = null;

  /** Затмение приходит: ходить нельзя, касание ускоряет сцену. */
  arriving = false;
  /** Новая подача: обычные ночи тихие, Затмение приходит только в свою ночь. */
  private warOn = false;

  /** Живо ли солнце; без него Затмение рисуется по-старому. */
  private get liveSun(): BlackSun | null {
    return this.sun && !this.sun.lost ? this.sun : null;
  }

  /** Можно ли показать удар новой подачей прямо сейчас. */
  get war(): boolean {
    return this.warOn && !!this.scene.world.res.gl?.active && (!this.foe || !!this.liveSun);
  }

  /** Касание ускоряет сцены, как и подсчёт. */
  private get pace(): number {
    return this.scene.world.res.speed * this.scene.presenter.hurry;
  }

  private startWar(): void {
    const { res } = this.scene.world;
    if (res.impact === 'none' || !res.gl?.active || this.calm) return;
    this.warOn = true;
    if (!this.foe) return;
    const size = Math.round(Math.min(900, this.sunRadius() * 2 * 1.62 * Math.min(res.dpr, 1.5)));
    this.sun = BlackSun.create(size, sunLook(this.scene.night.bossId ?? undefined));
    if (!this.sun) {
      this.warOn = false;
      return;
    }
    res.gl.ambient = true;
    this.applyHp(1 - this.shown);
    this.hpShown = Math.max(0, this.scene.night.target - this.scene.night.score);
    const world = this.scene.world;
    this.frontEntity = world.create();
    world.add(this.frontEntity, Transform, transform(0, 0));
    world.add(this.frontEntity, Drawable, { layer: Layer.Popups, z: -8, visible: true, draw: (ctx) => this.drawFront(ctx) });
    if (this.shown === 0) {
      // Сразу, а не после первого `await`: поле закрыто с первого кадра ночи
      this.arriving = true;
      void this.arrival();
    }
  }

  /** Созвездия, сплетённые в этой главе, сбивают щит Затмения: подготовка окупается. */
  private async arrival(): Promise<void> {
    const sun = this.sun;
    const gl = this.scene.world.res.gl;
    if (!sun || !gl) return;
    const { world, svc, run } = this.scene;
    const tw = svc.tweens;
    const me: GoalSky = this;
    const gold = '#f6c25b';
    const wait = (s: number): Promise<void> => tw.wait(s / this.scene.presenter.hurry);
    sun.state.layers = 2;
    this.scene.presenter.hurry = 1;
    this.arriving = true;
    await wait(0.6);
    void tw.to(me, { nameK: 1 }, { duration: 0.4, ease: 'outCubic' });
    await tw.to(me, { front: 1 }, { duration: 0.5 / this.scene.presenter.hurry, ease: 'outCubic' });
    await wait(0.9);
    // Имя уходит раньше созвездий: на телефоне они встают на его место
    void tw.to(me, { nameK: 0 }, { duration: 0.2 });
    const c = this.sunCenter();
    const r = this.frontRadius();
    const b = this.scene.layout.board;
    const wide = b.w > b.h * 1.2;
    const woven = (['dusk', 'midnight'] as const).map((kind) => figureFor(run.seed, run.ante, kind));
    gl.setLook('nova');
    for (const [i, figure] of woven.entries()) {
      // Фигуры выходят по сторонам от врага и бьют в него
      const side = i === 0 ? -1 : 1;
      const at = wide ? { x: c.x + side * r * 2.5, y: c.y } : { x: c.x + side * r * 0.2, y: c.y + (i === 0 ? -1 : 1) * r * 1.9 };
      const span = r * 1.35;
      const star = (k: number): Pt => {
        const [sx, sy] = figure.stars[k]!;
        return { x: at.x + ((sx - 50) / 100) * span, y: at.y + ((sy - 50) / 100) * span };
      };
      const lines = figure.lines.map(([p, q]) => gl.thread([star(p), star(q)], gold, 0.4, 6));
      figure.stars.forEach((_, k) => gl.glint(star(k), r * 0.5, gold, 0.95));
      await wait(0.72);
      const bolt = gl.thread([at, this.limb(at)], gold, 0.22, 8);
      await wait(0.22);
      sun.state.hit = 1;
      this.kick = 1;
      void tw.to(me, { kick: 0 }, { duration: 0.3, ease: 'outCubic' });
      world.res.hold = Math.max(world.res.hold, 0.06);
      shake(world, 0.26);
      sun.state.hp = i === 0 ? 0.5 : 0;
      bolt.fade(0.25);
      for (const l of lines) l.fade(0.3);
      await wait(0.22);
    }
    gl.ring(c, r * 2.6, '#e8e4f4', 0.7);
    gl.sparks(c, { x: r * 1.2, y: r * 1.2 }, 160, '#e8e4f4', 1.2, 5, 1.6);
    sun.state.layers = 1;
    sun.state.hp = 1;
    await wait(0.7);
    await tw.to(me, { front: 0 }, { duration: 0.35 / this.scene.presenter.hurry, ease: 'inOutQuad' });
    this.arriving = false;
  }

  /** Диск за полем: карты лежат на теле врага, корона живёт в полях и швах. */
  private sunRadius(): number {
    const b = this.scene.layout.board;
    return Math.min(b.w, b.h) * 0.56;
  }

  /** Диск перед полем: виден целиком вместе с кольцом сил. */
  private frontRadius(): number {
    const b = this.scene.layout.board;
    return Math.min(b.w, b.h) * 0.36;
  }

  private sunCenter(): Pt {
    const b = this.scene.layout.board;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /** Кольцо сил и трещины: урон виден и потом, за картами. */
  private applyHp(hp: number): void {
    const sun = this.sun;
    if (!sun) return;
    sun.state.hp = hp;
    sun.state.crack = (1 - hp) * 2;
    sun.touch();
  }

  /** Сгусток короны поворачивается к последней карте: враг следит за тобой. */
  watch(p: Pt): void {
    if (!this.sun) return;
    const c = this.sunCenter();
    this.sun.state.focus = Math.atan2(c.y - p.y, p.x - c.x) || 0.001;
  }

  /** Куда приходит комета: в край диска со стороны карты. */
  private limb(from: Pt): Pt {
    const c = this.sunCenter();
    const d = Math.hypot(from.x - c.x, from.y - c.y) || 1;
    const r = this.frontRadius() * 0.92;
    return { x: c.x + ((from.x - c.x) / d) * r, y: c.y + ((from.y - c.y) / d) * r };
  }

  /** Удар хода. В обычную ночь тихая нить в звезду, в ночь Затмения кометы во врага. */
  async strike(lines: Pt[], hues: string[], parts: readonly number[], before: number, progress: number): Promise<void> {
    const gl = this.scene.world.res.gl;
    if (!gl) return;
    if (!this.foe) return this.weaveHit(lines, progress);
    const sun = this.liveSun;
    if (!sun) return;
    const { world, svc } = this.scene;
    const tw = svc.tweens;
    const me: GoalSky = this;
    const target = this.scene.night.target;
    this.hpShown = Math.max(0, target - before);
    this.dmgShown = 0;
    await tw.to(me, { front: 1 }, { duration: 0.24 / this.pace, ease: 'outCubic' });
    const n = Math.max(1, lines.length);
    let dealt = 0;
    // Одна комета на линию: удар крупный, а не россыпь вспышек
    for (const [i, from] of lines.entries()) {
      const to = this.limb(from);
      const last = i === n - 1;
      const fly = 0.3 / this.pace;
      gl.comet(from, to, hues[i % hues.length] ?? '#ffd98a', fly, this.scene.layout.cardW);
      await tw.wait(fly);
      dealt += parts[i] ?? 0;
      world.res.hold = Math.max(world.res.hold, (last ? 0.09 : 0.06) / this.pace);
      world.res.camera.zoom = Math.max(world.res.camera.zoom, last ? 0.028 : 0.016);
      world.res.camera.focusX = to.x;
      world.res.camera.focusY = to.y;
      shake(world, last ? 0.3 : 0.18);
      sun.state.hit = last ? 1 : 0.6;
      this.kick = 1;
      void tw.to(me, { kick: 0 }, { duration: 0.3 / this.pace, ease: 'outCubic' });
      this.applyHp(clamp01(1 - (before + dealt) / target));
      this.hpShown = Math.max(0, target - before - dealt);
      this.dmgShown = dealt;
      this.dmgPop = 1;
      void tw.to(me, { dmgPop: 0 }, { duration: 0.24 / this.pace, ease: 'outCubic' });
      gl.sparks(to, { x: 6, y: 6 }, last ? 44 : 24, '#ffe9c4', 0.7, 5, 1.2);
      svc.audio.count(6 + i * 3, 'xmult');
      svc.haptics.play(last ? 'heavy' : 'count');
      if (!last) await tw.wait(0.06 / this.pace);
    }
    await tw.wait(0.42 / this.pace);
    // Добивание доигрывается в `hit`. Иначе враг уходит, и сцена отдаётся картам: пыль и дыры видно целиком
    if (progress < 1) await tw.to(me, { front: 0 }, { duration: 0.26 / this.pace, ease: 'inOutQuad' });
  }

  /** Тихий удар обычной ночи: нить в новую звезду, её видно поверх карт, поле не гаснет. */
  private async weaveHit(lines: Pt[], progress: number): Promise<void> {
    const gl = this.scene.world.res.gl;
    if (!gl) return;
    const tw = this.scene.svc.tweens;
    const speed = this.pace;
    const gold = '#f6c25b';
    const before = Math.ceil(this.shown * this.order.length - 0.001);
    const after = Math.max(before + 1, Math.ceil(clamp01(progress) * this.order.length - 0.001));
    const fresh = this.order.slice(before, Math.min(after, this.order.length));
    if (!fresh.length) return;
    const to = this.starPos(fresh[fresh.length - 1]!);
    const bolts = lines.map((from) => gl.thread([from, to], gold, 0.34 / speed, 8));
    await tw.wait(0.34 / speed);
    for (const star of fresh) gl.glint(this.starPos(star), this.scene.layout.cardW * 1.1, gold, 0.8, 0.9);
    const lit = new Set(this.order.slice(0, after));
    const fades = this.figure.lines.filter(([a, b]) => lit.has(a) && lit.has(b) && (fresh.includes(a) || fresh.includes(b))).map(([a, b]) => gl.thread([this.starPos(a), this.starPos(b)], gold, 0.24 / speed, 6));
    for (const b of bolts) b.fade(0.3 / speed);
    void tw.wait(0.7 / speed).then(() => {
      for (const f of fades) f.fade(0.4 / speed);
    });
  }

  /** Созвездие сплетено: фигура на миг встаёт над полем целиком. */
  private weaveWin(): void {
    const gl = this.scene.world.res.gl;
    if (!gl) return;
    const tw = this.scene.svc.tweens;
    const gold = '#f6c25b';
    gl.setLook('nova');
    const lines = this.figure.lines.map(([a, b]) => gl.thread([this.starPos(a), this.starPos(b)], gold, 0.5, 6));
    this.figure.stars.forEach((_, i) => gl.glint(this.starPos(i), this.scene.layout.cardW * 0.8, gold, 1.5, 0.9));
    void tw.wait(1.7).then(() => {
      for (const l of lines) l.fade(0.6);
    });
  }

  /** Третья ночь: ядро разбито, рассвет главы. */
  private async eclipseWin(): Promise<void> {
    const gl = this.scene.world.res.gl;
    const sun = this.liveSun;
    if (!sun) return;
    const { world, svc } = this.scene;
    const tw = svc.tweens;
    const me: GoalSky = this;
    if (!gl?.active) {
      // Слой выключился посреди ночи: враг всё равно разбит, только без залпа
      sun.touch();
      await tw.to(sun.state, { gone: 1 }, { duration: 0.4, ease: 'outCubic' });
      sun.touch();
      await tw.to(me, { front: 0 }, { duration: 0.25, ease: 'inOutQuad' });
      return;
    }
    const c = this.sunCenter();
    const r = this.frontRadius();
    gl.setLook('nova');
    world.res.hold = 0.14;
    sun.state.hit = 1;
    sun.state.crack = 2;
    await tw.wait(0.3);
    gl.glint(c, r * 4, '#ffe9c4', 1.1);
    gl.finale(c, r * 3.4, '#ffe9c4', 1);
    gl.sparks(c, { x: r, y: r }, 300, '#e8e4f4', 1.9, 6, 2.4);
    shake(world, 0.46);
    void tw.to(sun.state, { gone: 1 }, { duration: 0.5, ease: 'outCubic' });
    await tw.wait(0.9);
    await tw.to(me, { front: 0 }, { duration: 0.3, ease: 'inOutQuad' });
  }

  /** Перед полем: поле гаснет, враг крупно, над ним запас сил числом. */
  private drawFront(ctx: CanvasRenderingContext2D): void {
    const sun = this.liveSun;
    if (!sun || this.front <= 0.001) return;
    const { width, height } = this.scene.svc.renderer;
    const k = this.front;
    ctx.fillStyle = `rgba(3, 3, 14, ${0.8 * k})`;
    ctx.fillRect(-40, -40, width + 80, height + 80);
    const c = this.sunCenter();
    const r = this.sunRadius() + (this.frontRadius() - this.sunRadius()) * k;
    const s = r * 2 * 1.62 * (1 + this.kick * 0.07);
    ctx.globalAlpha = k;
    ctx.drawImage(sun.canvas, c.x - s / 2, c.y - s / 2, s, s);
    if (sun.state.gone < 0.5) {
      const size = Math.round(r * 0.46);
      ctx.font = `800 ${size}px 'Manrope Variable', Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = size * 0.2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(4, 3, 16, 0.92)';
      ctx.strokeText(num(this.hpShown), c.x, c.y);
      ctx.fillStyle = `rgb(255, ${238 - this.kick * 40}, ${220 - this.kick * 90})`;
      ctx.fillText(num(this.hpShown), c.x, c.y);
    }
    if (this.nameK > 0.01 && this.night.bossId) {
      const size = Math.round(Math.max(18, r * 0.2));
      ctx.globalAlpha = k * this.nameK;
      ctx.font = `400 ${size}px Forum, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#e8e4f4';
      ctx.shadowColor = 'rgba(5, 6, 26, 0.95)';
      ctx.shadowBlur = 10;
      ctx.fillText(named('boss', this.night.bossId).name.toUpperCase().split('').join('\u200a'), c.x, c.y - r * 1.5);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = k;
    }
    if (this.dmgShown > 0) {
      const size = Math.round(r * 0.5 * (1 + this.dmgPop * 0.35));
      const y = c.y + r * 1.62;
      ctx.font = `800 ${size}px 'Manrope Variable', Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(4, 3, 16, 0.92)';
      const text = `−${num(this.dmgShown)}`;
      ctx.strokeText(text, c.x, y);
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(text, c.x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** Созвездия попали: огонь из клеток в цель, прогресс догоняет счёт; на цели — финал. */
  async hit(progress: number, cells: Pt[]): Promise<void> {
    const tw = this.scene.svc.tweens;
    const me: GoalSky = this;
    const p = clamp01(progress);
    if (this.liveSun) {
      this.shown = p;
      this.applyHp(1 - p);
      if (p >= 1 && this.won < 1) {
        this.won = 1;
        await this.eclipseWin();
      }
      return;
    }
    if (this.warOn && p >= 1 && this.won < 1) this.weaveWin();
    if (!this.calm && !this.warOn) for (const from of uniq(cells)) this.beams.push({ from, to: this.aim(p), age: 0, life: 0.55 });
    this.hitK = 1;
    void tw.to(me, { hitK: 0 }, { duration: 0.9, ease: 'outCubic', delay: 0.25 });
    await tw.to(me, { shown: p }, { duration: this.calm ? 0.3 : 0.9, ease: 'outCubic', delay: 0.2 });
    if (!this.calm && !this.warOn) {
      const spark = this.aim(p);
      burst(this.scene.world, spark.x, spark.y, '#ffe6a8', { count: 14, speed: 220, colors: ['#ffe6a8', '#fff', this.variant === 'eclipse' ? '#e8e4f4' : '#f6c25b'] });
    }
    if (p >= 1 && this.won < 1) {
      if (this.foe) this.shatter();
      await tw.to(me, { won: 1 }, { duration: this.calm ? 0.3 : 1.2, ease: 'outCubic' });
    }
  }

  /** Куда летит огонь: в диск Затмения или в звезду, которая сейчас загорится. */
  private aim(p: number): Pt {
    const b = this.scene.layout.board;
    if (this.variant === 'eclipse') return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const k = Math.max(0, Math.min(this.order.length - 1, Math.ceil(p * this.order.length) - 1));
    return this.starPos(this.order[k]!);
  }

  private draw(ctx: CanvasRenderingContext2D, time: number): void {
    const sun = this.liveSun;
    if (sun) {
      const gl = this.scene.world.res.gl;
      sun.update(Math.max(0, time - this.lastTime), !gl?.active ? 0 : gl.level > 0 ? 4 : 2);
      this.lastTime = time;
      if (this.front >= 0.999) return;
      const c = this.sunCenter();
      const s = this.sunRadius() * 2 * 1.62;
      ctx.drawImage(sun.canvas, c.x - s / 2, c.y - s / 2, s, s);
      return;
    }
    const dt = 1 / 60;
    for (const beam of this.beams) beam.age += dt;
    this.beams = this.beams.filter((beam) => beam.age < beam.life);
    if (this.variant === 'eclipse') this.drawEclipse(ctx, time);
    else this.drawFigure(ctx, time);
    this.drawBeams(ctx);
  }

  // ── Затмение ─────────────────────────────────────────────────────────────
  private drawEclipse(ctx: CanvasRenderingContext2D, time: number): void {
    const b = this.scene.layout.board;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    // Диск — меньше центра поля, а луна полупрозрачная: клетки под ним читаются (критика 03.11:
    // непрозрачный диск на 4 центральных клетках мешал понять, куда класть карту)
    const r = Math.min(b.w, b.h) * 0.22;
    const p = this.shown;
    const shake = this.calm ? 0 : this.hitK * Math.sin(time * 70) * 4;
    // Солнце за луной: чем ближе цель, тем больше его видно
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * (2.1 + 0.6 * p));
    halo.addColorStop(0, `rgba(232, 228, 244, ${0.28 + 0.2 * this.hitK})`);
    halo.addColorStop(0.35, `rgba(200, 190, 255, ${0.1 + 0.08 * p})`);
    halo.addColorStop(1, 'rgba(200, 190, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (2.1 + 0.6 * p), 0, Math.PI * 2);
    ctx.fill();
    const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    sun.addColorStop(0, `rgba(255, 240, 205, ${0.34 + 0.16 * this.won})`);
    sun.addColorStop(0.75, `rgba(255, 200, 120, ${0.26 + 0.14 * this.won})`);
    sun.addColorStop(1, 'rgba(246, 194, 91, 0.12)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Тени к задетым клеткам (вариант b) — под луной, от края диска
    if (this.foe) this.drawTendrils(ctx, cx, cy, r, time);
    // Луна сходит с солнца по мере счёта: растёт серп; на цели тает. При приходе — наползает
    const off = r * 1.15 * p ** 1.1 + r * 2.4 * (1 - this.arrive) ** 2;
    ctx.globalAlpha = 0.78 * (1 - this.won);
    ctx.fillStyle = '#04030d';
    ctx.beginPath();
    ctx.arc(cx + off * 0.82 + shake, cy - off * 0.57, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 228, 244, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Знак Затмения на луне — жемчугом: это он, противник
    if (this.sigil) {
      const size = r * 1.05;
      ctx.globalAlpha = (1 - this.won) * this.arrive * (0.55 + 0.25 * this.hitK);
      ctx.globalCompositeOperation = 'luminosity';
      ctx.drawImage(this.sigil, cx + off * 0.82 + shake - size / 2, cy - off * 0.57 - size / 2, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (this.foe) this.drawThreat(ctx, cx, cy, r);
    // Кольцо тени: запас Затмения, тает с каждым созвездием (при приходе — набирается)
    const ring = r * 1.42;
    const left = (1 - p) * this.arrive;
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(232, 228, 244, 0.1)';
    ctx.beginPath();
    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
    ctx.stroke();
    if (left > 0.001) {
      ctx.strokeStyle = `rgba(20, 14, 48, ${0.92 * (1 - this.won)})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      ctx.strokeStyle = `rgba(232, 228, 244, ${(0.55 + 0.4 * this.hitK) * (1 - this.won)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /**
   * Имя и цель под диском, пока Затмение приходит, и ещё несколько секунд (вместо тоста). Правило
   * не повторяем: оно и так строкой в табло (критика 03.11: дважды одно и то же, и поверх клеток).
   */
  private drawThreat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const id = this.night.bossId;
    if (!id) return;
    const since = this.scene.world.res.time - this.bornAt;
    const k = Math.min(this.arrive, Math.max(0, 1 - (since - 5) / 1.2)) * (1 - this.won);
    if (k <= 0.01) return;
    const name = named('boss', id).name;
    const y = cy + r * 1.42 + 30;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(5, 6, 26, 0.95)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#e8e4f4';
    ctx.font = `400 ${Math.round(Math.max(18, r * 0.22))}px Forum, serif`;
    ctx.fillText(name.toUpperCase().split('').join('\u200a'), cx, y);
    ctx.fillStyle = '#ffe6a8';
    ctx.font = `700 ${Math.round(Math.max(13, r * 0.14))}px 'Manrope Variable', Manrope, sans-serif`;
    ctx.fillText(t('foe.beat', { n: this.night.target }), cx, y + 22);
    ctx.restore();
  }

  /** Клетки, которые Затмение задело: запечатанные и карты затмённой масти на небе. */
  private touched(): number[] {
    const n = this.night;
    const out: number[] = [];
    n.grid.forEach((card, i) => {
      if (n.sealed[i] || (card && n.rules.debuffSuit && card.suit === n.rules.debuffSuit)) out.push(i);
    });
    return out;
  }

  /** Тени от диска к задетым клеткам; удар созвездия их отдёргивает, на победе они тают. */
  private drawTendrils(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, time: number): void {
    const cells = this.touched();
    if (!cells.length) return;
    const k = this.arrive * (1 - this.won) * (1 - 0.7 * this.hitK);
    if (k <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const i of cells) {
      const c = this.scene.layout.cells[i];
      if (!c) continue;
      const dx = c.x - cx;
      const dy = c.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const sx = cx + (dx / d) * r;
      const sy = cy + (dy / d) * r;
      const wob = this.calm ? 0 : Math.sin(time * 1.3 + i) * 10;
      const mx = (sx + c.x) / 2 - (dy / d) * wob;
      const my = (sy + c.y) / 2 + (dx / d) * wob;
      const reach = 0.35 + 0.65 * k;
      const ex = sx + (c.x - sx) * reach;
      const ey = sy + (c.y - sy) * reach;
      // Тень сужается к цели: толстая у диска, тонкая у карты; жемчужная кромка — видно на тёмном небе
      ctx.shadowColor = `rgba(200, 190, 255, ${0.5 * k})`;
      ctx.shadowBlur = 10;
      for (const [w, a] of [[11, 0.85], [6, 0.9]] as const) {
        ctx.strokeStyle = `rgba(10, 6, 28, ${a * k})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(232, 228, 244, ${0.55 * k})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Победа: кольцо тени разбивается на жемчужные осколки. */
  private shatter(): void {
    if (this.shattered || this.calm) return;
    this.shattered = true;
    const b = this.scene.layout.board;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const ring = Math.min(b.w, b.h) * 0.22 * 1.42;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      burst(this.scene.world, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, '#e8e4f4', { count: 4, speed: 260, colors: ['#e8e4f4', '#fff', '#b9b0e6'] });
    }
  }

  // ── Созвездие ночи ───────────────────────────────────────────────────────
  private frame(): { x: number; y: number; w: number; h: number } {
    const { width, height } = this.scene.svc.renderer;
    const b = this.scene.layout.board;
    // Во всё небо, заметно крупнее поля: фигура за сеткой, а не на ней — её не спутать с
    // созвездиями игрока на клетках (критика 03.11)
    const s = Math.min(width * 0.98, height * 0.92, Math.max(b.w, b.h) * 1.9);
    return { x: b.x + b.w / 2 - s / 2, y: Math.max(height * 0.04, b.y + b.h / 2 - s / 2), w: s, h: s };
  }

  private starPos(i: number): Pt {
    const f = this.frame();
    const [sx, sy] = this.figure.stars[i]!;
    return { x: f.x + (sx / 100) * f.w, y: f.y + (sy / 100) * f.h };
  }

  private drawFigure(ctx: CanvasRenderingContext2D, time: number): void {
    const f = this.frame();
    const litCount = this.shown * this.order.length;
    const lit = new Map<number, number>();
    this.order.forEach((star, k) => lit.set(star, clamp01(litCount - k)));
    // Линии: пунктир, пока звёзды не горят; загораются, когда горят обе
    for (const [a, z] of this.figure.lines) {
      const pa = this.starPos(a);
      const pz = this.starPos(z);
      const k = Math.min(lit.get(a)!, lit.get(z)!);
      ctx.setLineDash(k >= 1 ? [] : [3, 6]);
      // Горящие линии тоньше и тише вспыхнувших рядов игрока (те — яркие и толстые), до цели ≤ 0,35
      ctx.strokeStyle = k >= 1 ? `rgba(255, 230, 168, ${(this.warOn ? 0.62 : 0.32) + 0.4 * this.won})` : `rgba(234, 230, 255, ${this.warOn ? 0.22 : 0.12})`;
      ctx.lineWidth = k >= 1 ? 1.1 + this.won : 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pz.x, pz.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Звёзды: тусклые точки → яркие с лучами
    ctx.globalCompositeOperation = 'lighter';
    this.figure.stars.forEach(([, , mag], i) => {
      const p = this.starPos(i);
      const k = lit.get(i)!;
      const base = (starRadius(mag) / 100) * f.w * 0.55 + 1.5;
      if (k <= 0) {
        ctx.fillStyle = 'rgba(234, 230, 255, 0.32)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * 0.55, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Мерцание медленное, ореол сдержанный: звезда фигуры не спорит с картами на поле (критика 03.11)
      const tw = this.calm ? 1 : 0.9 + 0.1 * Math.sin(time * 1.2 + i * 1.7);
      const r = base * (1 + k * 1.1) * tw;
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * 0.9 * k;
      ctx.drawImage(starGlow(0.36), p.x - r * 3, p.y - r * 3, r * 6, r * 6);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(255, 246, 224, ${0.25 * k})`;
      ctx.fillRect(p.x - r * 2.4, p.y - 0.5, r * 4.8, 1);
      ctx.fillRect(p.x - 0.5, p.y - r * 2.4, 1, r * 4.8);
    });
    ctx.globalCompositeOperation = 'source-over';
    // Победа: имя созвездия под ним, как подпись на карте неба
    if (this.won > 0) {
      ctx.globalAlpha = this.won;
      ctx.fillStyle = '#ffe6a8';
      ctx.font = `400 ${Math.round(Math.max(18, f.w * 0.06))}px Forum, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const name = t(`constellation.${this.figure.id}`).toUpperCase().split('').join(' ');
      ctx.shadowColor = 'rgba(246, 194, 91, 0.6)';
      ctx.shadowBlur = 14;
      ctx.fillText(name, f.x + f.w / 2, Math.min(this.scene.svc.renderer.height - 12, f.y + f.h + 6));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // ── Огонь из клеток в цель ───────────────────────────────────────────────
  private drawBeams(ctx: CanvasRenderingContext2D): void {
    if (!this.beams.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const beam of this.beams) {
      const k = beam.age / beam.life;
      const head = Math.min(1, k * 1.8);
      const tail = Math.max(0, k * 1.8 - 0.8);
      const at = (u: number) => ({ x: beam.from.x + (beam.to.x - beam.from.x) * u, y: beam.from.y + (beam.to.y - beam.from.y) * u });
      const a = at(tail);
      const z = at(head);
      const g = ctx.createLinearGradient(a.x, a.y, z.x, z.y);
      g.addColorStop(0, 'rgba(255, 230, 168, 0)');
      g.addColorStop(1, `rgba(255, 246, 224, ${0.9 * (1 - k * 0.5)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(z.x, z.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }
}

function uniq(pts: Pt[]): Pt[] {
  const seen = new Set<string>();
  return pts.filter((p) => {
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
