import { bodyColor } from '@/art/bodies';
import { SUIT_COLORS, UI } from '@/art/palette';
import { assertNever } from '@/core/errors';
import type { GameEvent, LineScore, PlacementScore, ScoreStep, Suit } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import { dict, named, num, t } from '@/i18n';
import { toast } from '@/ui/widgets';
import { CardView, Drawable, Layer, Transform } from '../components';
import { burst, cellFlash, dustPuff, flash, floatText, ring, shake } from '../fx';
import { handPositions } from '../layout';
import { shockwave } from './flare';
import { drawFigure, type FigureFx } from './figures';
import type { NightScene } from './scene';

type Pt = { x: number; y: number };

/**
 * Превращает события ядра в анимации. Каждый обработчик ждёт своей анимации,
 * поэтому порядок на экране совпадает с порядком событий.
 */
export class Presenter {
  private fx: Entity[] = [];

  constructor(private readonly scene: NightScene) {}

  private get world() {
    return this.scene.world;
  }

  private get tweens() {
    return this.scene.svc.tweens;
  }

  private get audio() {
    return this.scene.svc.audio;
  }

  /** Касание во время подсчёта ускоряет его до конца хода (долгий крест не держит игрока). */
  hurry = 1;
  /** Яркая вспышка и быстрый подсчёт (CQ.6, `brightFlare`): волны света по небу. */
  flare = false;
  /** Темп подсчёта: с яркой вспышкой паузы короче, чтобы удар не тонул в ожидании. */
  private get pace(): number {
    return this.flare ? 0.6 : 1;
  }

  private get speed() {
    return this.world.res.speed * this.hurry;
  }

  private wait(seconds: number): Promise<void> {
    return this.tweens.wait(seconds / this.speed);
  }

  async play(events: GameEvent[], dragged?: Entity): Promise<void> {
    this.hurry = 1;
    for (const ev of events) {
      if (this.scene.isDestroyed) return;
      await this.handle(ev, dragged);
    }
    this.hurry = 1;
    if (!this.scene.isDestroyed) this.scene.hud.sync(this.scene.run, { score: false });
  }

  private async handle(ev: GameEvent, dragged?: Entity): Promise<void> {
    switch (ev.t) {
      case 'place':
        return this.onPlace(ev.card.id, ev.handIndex, ev.cell, dragged);
      case 'draw':
        for (const card of ev.cards) {
          const e = this.scene.createCard(card, this.scene.layout.deck.x, this.scene.layout.deck.y, 'hand');
          this.world.req(e, Transform).flip = -1;
          this.scene.hand.push(card.id);
        }
        this.scene.hud.setDeckCount(this.scene.night.drawPile.length);
        return this.dealToHand(ev.cards.map((c) => c.id));
      case 'burn':
        return this.onBurn(ev.card.id, ev.handIndex);
      case 'ignite':
        return this.onIgnite(ev.score, ev.scoreAfter);
      case 'clear':
        return this.onClear(ev.cells);
      case 'cardDestroyed':
        return ev.reason === 'consumed' ? this.onConsume(ev.cardId) : this.onShatter(ev.cardId);
      case 'cardStays':
        // Карта остаётся на небе: её не уносит «clear»; Полярная звезда это показывает
        return this.onStays(ev.cardId);
      case 'knocked':
        return this.onKnocked(ev.cardId, ev.cell, ev.by);
      case 'pulse':
        return this.onPulse(ev.cell, ev.total);
      case 'gold':
        this.scene.hud.setGold(ev.goldAfter);
        if (ev.amount > 0) this.audio.coin();
        return;
      case 'omenChanged':
        return;
      case 'reshuffle':
        toast(t('night.reshuffled'));
        return this.wait(0.2);
      case 'nightStart':
        return;
      case 'nightWon':
        return this.onWin();
      case 'nightLost':
        return this.onLose();
      default:
        return assertNever(ev, 'event');
    }
  }

  // ─── Карты ──────────────────────────────────────────────────────────────

  /** Новые карты в руке: прилетают из колоды, переворачиваясь. */
  async dealToHand(ids: number[]): Promise<void> {
    const scene = this.scene;
    const pos = handPositions(scene.layout, scene.hand.length);
    const jobs: Promise<void>[] = [];
    let k = 0;
    scene.hand.forEach((id, i) => {
      const e = scene.cards.get(id);
      if (e === undefined) return;
      const tr = this.world.req(e, Transform);
      const view = this.world.req(e, CardView);
      view.zone = 'hand';
      view.lift = 0;
      view.glow = 0;
      this.world.req(e, Drawable).z = i;
      const p = pos[i]!;
      const fresh = ids.includes(id);
      const delay = fresh ? (k++ * 0.08) / this.speed : 0;
      const dur = (fresh ? 0.42 : 0.25) / this.speed;
      jobs.push(this.tweens.to(tr, { x: p.x, y: p.y, rot: p.rot, scale: 1 }, { duration: dur, delay, ease: 'outCubic' }));
      if (fresh) {
        jobs.push(this.tweens.to(tr, { flip: 1 }, { duration: dur * 0.8, delay: delay + dur * 0.2, ease: 'inOutQuad' }));
        window.setTimeout(() => this.audio.tick(), delay * 1000);
      }
    });
    await Promise.all(jobs);
  }

  private async onPlace(id: number, handIndex: number, cell: number, dragged?: Entity): Promise<void> {
    const scene = this.scene;
    const e = scene.cards.get(id)!;
    scene.hand.splice(handIndex, 1);
    scene.board[cell] = id;
    const view = this.world.req(e, CardView);
    view.zone = 'board';
    view.cell = cell;
    view.lift = 0;
    view.glow = 0;
    const d = this.world.req(e, Drawable);
    d.layer = Layer.Dragged;
    const tr = this.world.req(e, Transform);
    const p = scene.layout.cells[cell]!;
    void scene.layoutHand(true, dragged);
    await this.tweens.to(tr, { x: p.x, y: p.y, rot: 0, scale: scene.boardScale * 1.08 }, { duration: (dragged ? 0.12 : 0.22) / this.speed, ease: 'outCubic' });
    d.layer = Layer.BoardCards;
    d.z = cell;
    if (view.hideRank) {
      // «Туман»: ранг открывается, когда карта легла на небо, — дальше по полю можно планировать
      view.hideRank = false;
      floatText(this.world, p.x, p.y - scene.layout.cardH * 0.3, String(view.card.rank), { size: 28, display: true, color: '#fff', life: 0.8, rise: 20 });
    }
    this.audio.bell(view.card.rank);
    this.scene.svc.haptics.play('place');
    this.landingImpact(cell, view.card.suit, !!dragged);
    await this.tweens.to(tr, { scale: scene.boardScale }, { duration: 0.16 / this.speed, ease: 'outBack' });
    scene.hud.setMoves(scene.night.movesLeft, scene.night.burnsLeft);
  }

  /**
   * Удар приземления: клетка вспыхивает, от низа карты расходится пыль, ударная волна,
   * искры, соседние карты вздрагивают, экран коротко встряхивает.
   */
  private landingImpact(cell: number, suit: Suit, dragged: boolean): void {
    const scene = this.scene;
    const p = this.cellPos(cell);
    const { cardW, cardH } = scene.layout;
    cellFlash(this.world, p.x, p.y, cardW, cardH);
    ring(this.world, p.x, p.y, SUIT_COLORS[suit].light, cardW * 1.15, 0.5);
    dustPuff(this.world, p.x, p.y + cardH / 2, cardW);
    burst(this.world, p.x, p.y + cardH * 0.4, '#fff3c4', { count: 16, speed: 180, size: 1.8, life: 0.8, gravity: -30, kind: 'dot', angle: -Math.PI / 2, spread: Math.PI * 1.4, colors: ['#fff3c4', '#d9f0ff', '#ffffff'] });
    burst(this.world, p.x, p.y, '#ffffff', { count: 12, speed: 300, size: 1.8, life: 0.45, gravity: 200, colors: ['#ffffff', SUIT_COLORS[suit].light, SUIT_COLORS[suit].main] });
    const size = scene.night.rules.gridSize;
    const r = Math.floor(cell / size), c = cell % size;
    const near = [[r, c - 1, -1], [r, c + 1, 1], [r - 1, c, -1], [r + 1, c, 1]] as const;
    for (const [rr, cc, dir] of near) {
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const e = this.cardEntityAt(rr * size + cc);
      if (e === undefined) continue;
      const nt = this.world.req(e, Transform);
      void this.tweens.to(nt, { rot: dir * 0.045 }, { duration: 0.08 / this.speed, ease: 'outQuad' }).then(() => this.tweens.to(nt, { rot: 0 }, { duration: 0.22 / this.speed, ease: 'outBack' }));
    }
    shake(this.world, dragged ? 0.22 : 0.3);
  }

  private async onBurn(id: number, handIndex: number): Promise<void> {
    const scene = this.scene;
    const e = scene.cards.get(id)!;
    scene.hand.splice(handIndex, 1);
    const tr = this.world.req(e, Transform);
    const view = this.world.req(e, CardView);
    view.glowColor = '#ff7a3c';
    view.glow = 1;
    this.audio.burn();
    this.scene.svc.haptics.play('ignite');
    burst(this.world, tr.x, tr.y, '#ff7a3c', { count: 30, speed: 180, gravity: -260, life: 1, colors: ['#ff7a3c', '#ffcf6b', '#ff3b5c'] });
    await this.tweens.to(tr, { alpha: 0, y: tr.y - 40, scale: 0.8 }, { duration: 0.35 / this.speed, ease: 'inQuad' });
    this.world.destroy(e);
    scene.cards.delete(id);
    scene.hud.setMoves(scene.night.movesLeft, scene.night.burnsLeft);
    void scene.layoutHand(true);
  }

  private async onClear(cells: number[]): Promise<void> {
    const scene = this.scene;
    const jobs: Promise<void>[] = [];
    cells.forEach((cell, i) => {
      const id = scene.board[cell];
      if (id === null || id === undefined) return;
      scene.board[cell] = null;
      const e = scene.cards.get(id);
      if (e === undefined) return;
      scene.cards.delete(id);
      const tr = this.world.req(e, Transform);
      const view = this.world.req(e, CardView);
      const col = SUIT_COLORS[view.card.suit];
      const delay = (i * 0.03) / this.speed;
      jobs.push(
        this.tweens.to(tr, { scale: tr.scale * 1.15, alpha: 0 }, { duration: 0.3 / this.speed, delay, ease: 'inQuad' }).then(() => {
          burst(this.world, tr.x, tr.y, col.main, { count: 14, speed: 200, size: 1.6, colors: [col.main, col.light, '#ffffff'] });
          this.world.destroy(e);
        }),
      );
    });
    await Promise.all(jobs);
  }

  private async onShatter(cardId: number): Promise<void> {
    const e = this.scene.cards.get(cardId);
    if (e === undefined) return;
    const tr = this.world.req(e, Transform);
    this.audio.shatter();
    burst(this.world, tr.x, tr.y, '#c8f0ff', { count: 22, speed: 320, kind: 'shard', size: 5, gravity: 600, life: 0.9 });
    floatText(this.world, tr.x, tr.y - 20, t('night.shattered'), { size: 14, color: '#c8f0ff' });
    await this.wait(0.15);
  }

  // ─── Небесные тела (GF.4) ───────────────────────────────────────────────

  /** Полярная звезда не гаснет: холодное кольцо и подпись над ней. */
  private async onStays(cardId: number): Promise<void> {
    const e = this.scene.cards.get(cardId);
    if (e === undefined) return;
    const view = this.world.req(e, CardView);
    if (view.card.body !== 'polaris') return;
    const tr = this.world.req(e, Transform);
    const col = bodyColor('polaris');
    view.glowColor = col;
    view.glow = 1;
    ring(this.world, tr.x, tr.y, col, this.scene.layout.cardW * 1.4, 0.7);
    floatText(this.world, tr.x, tr.y - this.scene.layout.cardH * 0.45, t('night.stays'), { size: 14, color: col });
    void this.tweens.to(view, { glow: 0 }, { duration: 1.1 / this.speed, delay: 0.3 / this.speed });
  }

  /** Метеор выбил соседа: след от Метеора, карта улетает с неба кувырком. */
  private async onKnocked(cardId: number, cell: number, by: number): Promise<void> {
    const scene = this.scene;
    const e = scene.cards.get(cardId);
    if (e === undefined) return;
    scene.board[cell] = null;
    scene.cards.delete(cardId);
    const from = this.cellPos(by);
    const to = this.cellPos(cell);
    const col = bodyColor('meteor');
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    burst(this.world, (from.x + to.x) / 2, (from.y + to.y) / 2, col, { count: 18, speed: 160, size: 2, life: 0.6, angle: Math.atan2(dy, dx), spread: 0.5, colors: [col, '#ffe2c4', '#ffffff'] });
    this.audio.burn();
    this.scene.svc.haptics.play('place');
    shake(this.world, 0.25);
    const tr = this.world.req(e, Transform);
    const len = Math.hypot(dx, dy) || 1;
    await this.tweens.to(tr, { x: tr.x + (dx / len) * 90, y: tr.y + (dy / len) * 90 - 50, rot: Math.sign(dx || 1) * 0.9, alpha: 0, scale: tr.scale * 0.7 }, { duration: 0.45 / this.speed, ease: 'inQuad' });
    this.world.destroy(e);
  }

  /** Пульсар зарядился: волна от него и общий заряд множителя над ним. */
  private async onPulse(cell: number, total: number): Promise<void> {
    const p = this.cellPos(cell);
    const col = bodyColor('pulsar');
    const { cardW, cardH } = this.scene.layout;
    ring(this.world, p.x, p.y, col, cardW * 1.2, 0.5);
    ring(this.world, p.x, p.y, col, cardW * 2, 0.8);
    floatText(this.world, p.x, p.y - cardH * 0.45, t('night.pulse', { n: total }), { size: 16, color: UI.mult });
    this.audio.tick();
    await this.wait(0.2);
  }

  /** Чёрная дыра схлопывается: карта закручивается в точку, вокруг — золотое кольцо. */
  private async onConsume(cardId: number): Promise<void> {
    const e = this.scene.cards.get(cardId);
    if (e === undefined) return;
    const tr = this.world.req(e, Transform);
    const col = bodyColor('blackhole');
    ring(this.world, tr.x, tr.y, col, this.scene.layout.cardW * 1.3, 0.6);
    burst(this.world, tr.x, tr.y, col, { count: 20, speed: 120, size: 1.8, life: 0.5, colors: [col, '#ffffff'] });
    floatText(this.world, tr.x, tr.y - 20, t('night.consumed'), { size: 14, color: col });
    this.audio.shatter();
    await this.tweens.to(tr, { scale: tr.scale * 0.1, rot: tr.rot + 3.5 }, { duration: 0.55 / this.speed, ease: 'inCubic' });
  }

  // ─── Вспышка ────────────────────────────────────────────────────────────

  private cellPos(cell: number): Pt {
    return this.scene.layout.cells[cell]!;
  }

  private lineCenter(line: LineScore): Pt {
    const pts = line.cells.map((c) => this.cellPos(c));
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }

  private cardEntityAt(cell: number): Entity | undefined {
    const id = this.scene.board[cell];
    return id === null || id === undefined ? undefined : this.scene.cards.get(id);
  }

  /** Карта на пути искры: подпрыгивает, загорается мастью, сыплет искры. */
  private igniteCard(cell: number): void {
    const e = this.cardEntityAt(cell);
    if (e === undefined) return;
    const v = this.world.req(e, CardView);
    const tr = this.world.req(e, Transform);
    const col = SUIT_COLORS[v.card.suit];
    v.glowColor = col.main;
    void this.tweens.to(v, { glow: 1 }, { duration: 0.15 / this.speed });
    const base = this.scene.boardScale;
    tr.scale = base * 1.12;
    void this.tweens.to(tr, { scale: base }, { duration: 0.3 / this.speed, ease: 'outBack' });
    const p = this.cellPos(cell);
    burst(this.world, p.x, p.y, col.main, { count: 18, speed: 300, size: 2.2, life: 0.7, colors: [col.main, '#ffffff', '#fff3c4'] });
    shake(this.world, 0.06);
  }

  /** Линия уходит: вдоль созвездия поднимается золотая звёздная пыль, свечение гаснет. */
  private dissolveLine(line: LineScore, state: { alpha: number }): void {
    const pts = line.cells.map((c) => this.cellPos(c));
    for (let k = 0; k < pts.length - 1; k++) {
      for (let j = 0; j < 10; j++) {
        const f = j / 10;
        const x = pts[k]!.x + (pts[k + 1]!.x - pts[k]!.x) * f;
        const y = pts[k]!.y + (pts[k + 1]!.y - pts[k]!.y) * f;
        burst(this.world, x, y, '#ffe6a8', { count: 1, speed: 50, size: 1.6, life: 0.9, gravity: -20, kind: 'dot', angle: -Math.PI / 2, spread: 1.6, colors: [['#ffe6a8', '#ffffff', '#fff3c4'][j % 3]!] });
      }
    }
    void this.tweens.to(state, { alpha: 0 }, { duration: 0.5 / this.speed, ease: 'outQuad' });
  }

  /** Созвездие линии — фигура через центры её карт (`figures.ts`). */
  private drawConstellation(line: LineScore, color: string): FigureFx {
    const fx = drawFigure(this.world, line.cells.map((c) => this.cellPos(c)), color);
    this.fx.push(fx.entity);
    return fx;
  }

  /**
   * Вспышка хода по этапам (TD.13): каждая формация вспыхивает и считается, затем шаги
   * уровня хода, затем итог летит в счёт. Мифы 0.7 — ещё одна формация со своей фигурой.
   */
  private async onIgnite(score: PlacementScore, scoreAfter: number): Promise<void> {
    const lineFx: FigureFx[] = [];
    for (const line of score.lines) {
      lineFx.push(await this.igniteLine(line, score.lines.length));
      await this.countLine(line);
    }
    await this.countMove(score);
    await this.landScore(score, scoreAfter, lineFx);
  }

  /** Линия загорается: созвездие прорисовывается, лента с названием, звёздная пыль. */
  private async igniteLine(line: LineScore, lines: number): Promise<FigureFx> {
    const hud = this.scene.hud;
    const firstCard = this.cardEntityAt(line.cells[0]!);
    const suit = firstCard !== undefined ? this.world.req(firstCard, CardView).card.suit : 'star';
    const color = SUIT_COLORS[suit].light;
    const center = this.lineCenter(line);

    // Линия загорается по картам: искра бежит по созвездию, каждая карта на её пути
    // подпрыгивает, вспыхивает своей мастью и сыплет искры
    const fx = this.drawConstellation(line, color);
    this.audio.ignite(lines);
    const drawDur = 0.42 / this.speed;
    const drawn = this.tweens.to(fx.state, { progress: 1 }, { duration: drawDur, ease: 'linear' });
    line.cells.forEach((cell, i) => {
      void this.tweens.wait((drawDur * i) / Math.max(1, line.cells.length - 1)).then(() => this.igniteCard(cell));
    });
    await drawn;
    // Название — лентой поперёк линии, над вспышкой; пока лента видна, линия живая и дышит
    fx.state.breathe = true;
    if (this.flare) {
      // Волна света от центра линии до края неба; второе кольцо — чуть позже и тише
      const { board } = this.scene.layout;
      const reach = Math.hypot(board.w, board.h) * 0.75;
      shockwave(this.world, center, reach, color, 0.7 / this.speed);
      shockwave(this.world, center, reach * 0.7, 'rgba(255,236,190,0.8)', 0.55 / this.speed, 0.08 / this.speed);
      flash(this.world, '255,240,200', 0.32, 0.4);
      shake(this.world, 0.26);
    } else {
      flash(this.world, '255,240,200', 0.22, 0.4);
      shake(this.world, 0.14);
    }
    hud.showRibbon(t(`combo.${line.combo}`), dict().comboDesc[line.combo] ?? '', center.y);
    await this.wait(this.flare ? 0.55 : 0.9);
    // Лента уходит — линия рассыпается звёздной пылью и гаснет, карты тихо светятся
    hud.hideRibbon();
    this.dissolveLine(line, fx.state);
    for (const cell of line.cells) {
      const e = this.cardEntityAt(cell);
      if (e !== undefined) void this.tweens.to(this.world.req(e, CardView), { glow: 0.35 }, { duration: 0.6 / this.speed });
    }
    return fx;
  }

  /** Формула линии: база созвездия, шаги карт, глифов и Знамений, итог линии. */
  private async countLine(line: LineScore): Promise<void> {
    const scene = this.scene;
    const hud = scene.hud;
    const center = this.lineCenter(line);
    const comboStep = line.steps[0]!;
    hud.showCalc(line.combo, comboStep.lightAfter, comboStep.multAfter);
    // Линия в верхнем ряду и панель её закроет — панель уходит вниз
    const topRow = line.cells.some((c) => c < scene.night.rules.gridSize);
    hud.placeCalc(topRow ? scene.cellRect(line.cells[0]!).y : null);
    hud.setCaption(t('calc.combo', { combo: t(`combo.${line.combo}`), light: num(comboStep.lightAfter), mult: fmtX(comboStep.multAfter) }));
    const steps = line.steps.slice(1);
    if (this.explain) {
      hud.showParts(line.combo, comboStep.lightAfter, comboStep.multAfter, steps.map((s) => (s.light
        ? { text: `${s.light > 0 ? '+' : ''}${num(s.light)}`, kind: 'light' as const }
        : { text: s.xMult !== undefined ? `×${fmtX(s.xMult)}` : `+${num(s.mult ?? 0)}`, kind: 'mult' as const })));
    }
    await this.wait(0.3 * this.pace);
    // Обучение может придержать подсчёт на открытой формуле, пока игрок читает
    const gate = this.scoringGate;
    if (gate) {
      this.scoringGate = null;
      await gate();
    }

    const stepDelay = Math.min(0.34, Math.max(0.14, 0.34 - steps.length * 0.01)) * this.pace;
    const seenCells = new Set<number>();
    // Длинная цепочка шагов не должна тянуться: искра летит не дольше паузы шага
    this.moteTime = Math.min(0.16, stepDelay * 0.85);
    for (let i = 0; i < steps.length; i++) {
      if (this.explain) hud.lightPart(i);
      await this.showStep(steps[i]!, i, seenCells);
      await this.wait(Math.max(0.04, stepDelay * this.stepPause - this.moteTime));
    }
    hud.setCalcTotal(line.total);
    hud.setCaption(t('calc.lineTotal', { light: num(line.light), mult: fmtX(line.mult), total: num(line.total) }));
    // Итог линии — крупно и с ударом, золотом; это та же одна метка, что у шагов хода: «×2» креста встаёт на её место
    this.replaceHudLabel(floatText(this.world, center.x, center.y + 4, num(line.total), { size: Math.round(Math.min(48, Math.max(34, scene.layout.cardH * 0.44))), color: UI.gold, life: 1.1, rise: 30, punch: true }));
    this.scene.svc.haptics.play('countMult');
    this.audio.count(steps.length + 2, 'light');
    await this.wait(0.35 * this.pace);
  }

  /** Шаги уровня хода: цепь креста, ×множители Знамений хода. */
  private async countMove(score: PlacementScore): Promise<void> {
    const scene = this.scene;
    const hud = scene.hud;
    const sum = score.lines.reduce((s, l) => s + l.total, 0);
    if (score.steps.length > 0) {
      hud.setCalcLabel(score.lines.length >= 2 ? t('night.cross') : t('night.score'));
      hud.setCalcMode('move');
      hud.setCalc(sum, 1);
      for (let i = 0; i < score.steps.length; i++) {
        const step = score.steps[i]!;
        const board = scene.layout.board;
        const bc = { x: board.x + board.w / 2, y: board.y + board.h / 2 };
        // Знамение вспыхивает в шапке, а метка — в центре неба, одна: новая вместо прошлой (CQ.10)
        if (step.source.kind === 'omen') hud.pulseOmen(step.source.uid);
        const label = step.source.kind === 'chain' ? t('night.chain', { n: step.xMult ?? 1 }) : `×${fmtX(step.xMult ?? 1)}`;
        this.replaceHudLabel(floatText(this.world, bc.x, bc.y, label, { size: step.source.kind === 'chain' ? 44 : 34, color: UI.mult, life: 1.2, punch: true }));
        hud.setCalc(sum, step.multAfter, 'mult');
        hud.setCalcTotal(Math.floor(sum * step.multAfter));
        hud.setCaption(
          step.source.kind === 'chain'
            ? t('calc.chain', { n: step.source.lines, x: fmtX(step.xMult ?? 1) })
            : this.sourceCaption(step),
        );
        this.audio.count(10 + i, 'xmult');
        this.scene.svc.haptics.play('countX');
        shake(this.world, 0.25);
        // Крест — ещё одно кольцо, розовое, как множитель: двойная линия — двойной счёт
        if (this.flare && step.source.kind === 'chain') {
          const lb = scene.layout.board;
          shockwave(this.world, { x: lb.x + lb.w / 2, y: lb.y + lb.h / 2 }, Math.hypot(lb.w, lb.h) * 0.8, 'rgba(255,107,139,0.9)', 0.6 / this.speed);
        }
        await this.wait(0.45 * this.pace);
      }
    }
  }

  /** Итог хода влетает в счёт: огоньки, удар, фигуры гаснут. */
  private async landScore(score: PlacementScore, scoreAfter: number, lineFx: FigureFx[]): Promise<void> {
    const scene = this.scene;
    const hud = scene.hud;
    const target = scene.night.target;
    const board = scene.layout.board;
    if (score.lines.length > 1 || score.xMult !== 1) {
      // Итог встаёт на место метки «Цепь ×2» в центре неба, а не поверх неё
      this.replaceHudLabel(floatText(this.world, board.x + board.w / 2, board.y + board.h / 2, `+${num(score.total)}`, { size: 52, color: UI.gold, life: 1.2, punch: true }));
    }
    // Формула своё отработала — убираем её, чтобы огоньки было видно на пути к счёту
    hud.hideCalc();
    await this.tweens.wait(0.2); // панель растворяется 0,18 с — огоньки летят уже по чистому небу
    await this.flyToScore(score.lines.flatMap((l) => l.cells));
    hud.setScore(scoreAfter, target);
    const power = Math.min(1, score.total / target);
    this.audio.impact(power);
    shake(this.world, Math.min(0.7, 0.12 + power * 0.6));
    this.scene.svc.haptics.play(score.lines.length > 1 ? 'cross' : power > 0.5 ? 'heavy' : 'ignite');
    if (power >= 0.35 || score.lines.length > 1) flash(this.world, score.lines.length > 1 ? '255,214,140' : '200,230,255', 0.25 + power * 0.35);
    for (const line of score.lines) {
      for (const cell of line.cells) {
        const p = this.cellPos(cell);
        const e = this.cardEntityAt(cell);
        const col = e !== undefined ? SUIT_COLORS[this.world.req(e, CardView).card.suit] : SUIT_COLORS.star;
        burst(this.world, p.x, p.y, col.main, { count: 10 + Math.round(power * 20), speed: 260 + power * 300, colors: [col.main, col.light, '#fff'] });
      }
    }
    await Promise.all(lineFx.map((fx) => this.tweens.to(fx.state, { alpha: 0 }, { duration: 0.4 / this.speed })));
    for (const fx of lineFx) this.world.destroy(fx.entity);
    this.fx = this.fx.filter((e) => this.world.isAlive(e));
    hud.hideCalc();
  }

  /** Во сколько раз дольше держать каждый шаг (обучение замедляет подсчёт). */
  stepPause = 1;
  /** Обучение: под формулой — база созвездия и вклад каждого шага (TU.3). */
  explain = false;
  /** Одноразовая пауза перед шагами первого подсчёта (обучение). */
  scoringGate: (() => Promise<void>) | null = null;

  /** Что изменилось в шаге — словами. */
  private effectText(step: ScoreStep): string {
    if (step.light) return t(step.light > 0 ? 'fx.light' : 'fx.lightMinus', { n: num(step.light) });
    if (step.mult) return t('fx.mult', { n: num(step.mult) });
    if (step.xMult !== undefined) return t('fx.xmult', { n: fmtX(step.xMult) });
    if (step.gold) return t(step.gold > 0 ? 'fx.gold' : 'fx.goldMinus', { n: step.gold });
    return '';
  }

  /** Подпись шага: кто и что добавил. */
  private sourceCaption(step: ScoreStep, again = false): string {
    const src = step.source;
    const effect = this.effectText(step);
    switch (src.kind) {
      case 'card': {
        const text = t('calc.card', { n: num(step.light ?? 0), rank: step.light ?? 0 });
        return again ? `${text} — ${t('calc.retrigger')}` : text;
      }
      case 'glyph':
        return t('calc.glyph', { glyph: t(`glyph.${src.glyph}`), desc: effect });
      case 'body':
        return t('calc.glyph', { glyph: t(`body.${src.body}`), desc: effect });
      case 'omen':
        return t('calc.omen', { name: named('omen', src.omenId).name, effect });
      case 'boss':
        return t('calc.boss', { name: named('boss', src.bossId).name, effect });
      case 'combo':
      case 'chain':
        return effect;
    }
  }

  /**
   * Огоньки летят от карт созвездия к счёту. Рисуются в DOM-слое поверх HUD —
   * на канвасе они уходили бы под полоску очков.
   */
  private async flyToScore(cells: number[]): Promise<void> {
    const target = this.scene.hud.scoreAnchor();
    const layer = document.getElementById('ui')!;
    const unique = [...new Set(cells)];
    const dur = (this.flare ? 380 : 520) / this.speed;
    const jobs: Promise<void>[] = [];
    unique.forEach((cell, i) => {
      const from = this.cellPos(cell);
      const e = this.cardEntityAt(cell);
      const color = e !== undefined ? SUIT_COLORS[this.world.req(e, CardView).card.suit].light : '#fff';
      for (let k = 0; k < 2; k++) {
        const orb = document.createElement('div');
        orb.className = 'score-orb';
        orb.style.setProperty('--orb', color);
        layer.append(orb);
        const sx = from.x + (k - 0.5) * 14;
        const mid = { x: (sx + target.x) / 2 + (Math.random() - 0.5) * 140, y: Math.min(from.y, target.y) + (from.y - target.y) * 0.35 };
        const anim = orb.animate(
          [
            { transform: `translate(${sx}px, ${from.y}px) scale(0.6)`, opacity: 0 },
            { transform: `translate(${sx}px, ${from.y}px) scale(1.2)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${mid.x}px, ${mid.y}px) scale(1)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${target.x}px, ${target.y}px) scale(0.5)`, opacity: 0.9 },
          ],
          { duration: dur, delay: (i * 45 + k * 60) / this.speed, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' },
        );
        jobs.push(
          anim.finished
            .then(() => this.audio.tick())
            .catch(() => undefined)
            .finally(() => orb.remove()),
        );
      }
    });
    await Promise.race([Promise.all(jobs), this.wait(1.4)]);
  }

  private async showStep(step: ScoreStep, index: number, seenCells = new Set<number>()): Promise<void> {
    let again = false;
    if (step.source.kind === 'card') {
      again = seenCells.has(step.source.cell);
      seenCells.add(step.source.cell);
    }
    this.scene.hud.setCaption(this.sourceCaption(step, again));
    const scene = this.scene;
    const hud = scene.hud;
    let anchor: Pt | null = null;
    let cardEntity: Entity | undefined;
    /** Откуда летит искра в формулу: от Знамения или Затмения, хоть метка и на небе. */
    let moteFrom: Pt | null = null;
    const src = step.source;
    if (src.kind === 'card' || src.kind === 'glyph') {
      anchor = this.cellPos(src.cell);
      cardEntity = this.cardEntityAt(src.cell);
    } else if (src.kind === 'omen') {
      const omenPos = hud.pulseOmen(src.uid);
      if (src.cell !== undefined) {
        anchor = this.cellPos(src.cell);
        cardEntity = this.cardEntityAt(src.cell);
      } else moteFrom = omenPos;
    } else if (src.kind === 'boss') moteFrom = hud.bossAnchor();
    // Метка Знамения или Затмения без своей карты — в центре неба: под шапкой она ложилась на
    // лоток подсчёта (ландшафт) и на цифры верхнего ряда карт (телефон) (CQ.10)
    const fromHud = !anchor;
    const board = scene.layout.board;
    anchor ??= { x: board.x + board.w / 2, y: board.y + board.h / 2 };

    if (cardEntity !== undefined) {
      const tr = this.world.req(cardEntity, Transform);
      const base = scene.boardScale;
      tr.scale = base * 1.16;
      void this.tweens.to(tr, { scale: base }, { duration: 0.2 / this.speed, ease: 'outBack' });
    }

    let text = '';
    let color = '#fff';
    let kind: 'light' | 'mult' | 'xmult' | 'gold' = 'light';
    if (step.light) {
      text = `${step.light > 0 ? '+' : ''}${num(step.light)}`;
      color = UI.light;
    } else if (step.mult) {
      text = `${step.mult > 0 ? '+' : ''}${num(step.mult)}`;
      color = UI.mult;
      kind = 'mult';
    } else if (step.xMult !== undefined) {
      text = `×${fmtX(step.xMult)}`;
      color = UI.mult;
      kind = 'xmult';
    } else if (step.gold) {
      text = `${step.gold > 0 ? '+' : ''}${step.gold}◆`;
      color = UI.gold;
      kind = 'gold';
    }
    if (!text) return;
    // Над верхней кромкой карты: цифра не закрывает ранг в углу
    const offY = cardEntity !== undefined ? -scene.layout.cardH * 0.5 : 0;
    // Цифра по размеру карты: на телефоне крупнее прежнего, на ПК не раздувается
    const size = Math.round(Math.min(40, Math.max(28, scene.layout.cardH * 0.36)) * (kind === 'xmult' ? 1.2 : 1));
    const label = floatText(this.world, anchor.x, anchor.y + offY, text, { size, color, life: 1.05, punch: true });
    if (fromHud) this.replaceHudLabel(label);
    this.audio.count(index, kind);
    this.scene.svc.haptics.play(kind === 'xmult' ? 'countX' : kind === 'mult' ? 'countMult' : 'count');
    if (kind === 'xmult') shake(this.world, 0.15);
    const flashCell = kind === 'light' ? 'light' : kind === 'gold' ? undefined : 'mult';
    if (cardEntity !== undefined) {
      const col = SUIT_COLORS[this.world.req(cardEntity, CardView).card.suit];
      burst(this.world, anchor.x, anchor.y + offY, col.main, { count: 8, speed: 200, size: 1.8, life: 0.45, gravity: 60, colors: [color, col.light, '#fff'] });
    }
    // Искра от карты в свою ячейку формулы: глаз видит, куда ушла цифра; число в ячейке
    // меняется в момент её прилёта
    const to = flashCell ? hud.calcAnchor(flashCell) : null;
    if (!to || this.world.res.reduceMotion) {
      hud.setCalc(step.lightAfter, step.multAfter, flashCell);
      return;
    }
    await this.mote(moteFrom ?? { x: anchor.x, y: anchor.y + offY }, to, color);
    hud.setCalc(step.lightAfter, step.multAfter, flashCell);
  }

  /** Метка из шапки (Знамение, Затмение, цепь креста) в центре неба — одна: новая вместо прошлой. */
  private hudLabel: Entity | null = null;
  private replaceHudLabel(label: Entity): void {
    if (this.hudLabel !== null && this.hudLabel !== label && this.world.isAlive(this.hudLabel)) this.world.destroy(this.hudLabel);
    this.hudLabel = label;
  }

  /** Сколько летит искра шага подсчёта, с. Шаг ждёт её прилёта — пауза между шагами короче на столько же. */
  private moteTime = 0.16;

  private async mote(from: Pt, to: Pt, color: string): Promise<void> {
    const orb = document.createElement('div');
    orb.className = 'score-orb mote';
    orb.style.setProperty('--orb', color);
    document.getElementById('ui')!.append(orb);
    const mid = { x: (from.x + to.x) / 2 + (to.x > from.x ? -1 : 1) * 30, y: Math.min(from.y, to.y) - 20 };
    const anim = orb.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(1.3)`, opacity: 1 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(0.9)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(0.6)`, opacity: 0.9 },
      ],
      { duration: (this.moteTime * 1000) / this.speed, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)', fill: 'both' },
    );
    await Promise.race([anim.finished.catch(() => undefined), this.wait(this.moteTime * 1.5)]);
    orb.remove();
  }

  // ─── Конец ночи ─────────────────────────────────────────────────────────

  private async onWin(): Promise<void> {
    const { board } = this.scene.layout;
    this.audio.win();
    this.scene.svc.haptics.play('success');
    const colors = Object.values(SUIT_COLORS).flatMap((c) => [c.main, c.light]);
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => {
        burst(this.world, board.x + Math.random() * board.w, board.y + Math.random() * board.h, '#fff', { count: 40, speed: 420, colors, life: 1.4 });
      }, i * 160);
    }
    await this.wait(0.9);
  }

  private async onLose(): Promise<void> {
    this.audio.lose();
    this.scene.svc.haptics.play('error');
    for (const [, e] of this.scene.cards) {
      const tr = this.world.req(e, Transform);
      void this.tweens.to(tr, { alpha: 0.35 }, { duration: 0.8 });
    }
    await this.wait(0.9);
  }

  dispose(): void {
    for (const e of this.fx) this.world.destroy(e);
    this.fx = [];
  }
}

function fmtX(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, '');
}
