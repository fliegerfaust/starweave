import { SUIT_COLORS, UI } from '@/art/palette';
import type { GameEvent, LineScore, PlacementScore, ScoreStep } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import { named, num, t } from '@/i18n';
import { toast } from '@/ui/widgets';
import { CardView, Drawable, Layer, Transform, transform } from '../components';
import { burst, flash, floatText, ring, shake } from '../fx';
import { handPositions } from '../layout';
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

  private get speed() {
    return this.world.res.speed;
  }

  private wait(seconds: number): Promise<void> {
    return this.tweens.wait(seconds / this.speed);
  }

  async play(events: GameEvent[], dragged?: Entity): Promise<void> {
    for (const ev of events) {
      if (this.scene.isDestroyed) return;
      await this.handle(ev, dragged);
    }
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
      case 'shatter':
        return this.onShatter(ev.cardId);
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
    this.audio.bell(view.card.rank);
    this.scene.svc.haptics.play('place');
    ring(this.world, p.x, p.y, SUIT_COLORS[view.card.suit].main, scene.layout.cardW * 0.8, 0.5);
    await this.tweens.to(tr, { scale: scene.boardScale }, { duration: 0.12 / this.speed, ease: 'outBack' });
    scene.hud.setMoves(scene.night.movesLeft, scene.night.burnsLeft);
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

  /** Светящаяся ломаная через центры карт линии — собственно созвездие. */
  private drawConstellation(line: LineScore, color: string): { state: { progress: number; alpha: number }; entity: Entity } {
    const pts = line.cells.map((c) => this.cellPos(c));
    const state = { progress: 0, alpha: 1 };
    const e = this.world.create();
    this.world.add(e, Transform, transform(0, 0));
    this.world.add(e, Drawable, {
      layer: Layer.Effects,
      z: 0,
      visible: true,
      draw: (ctx) => {
        const total = pts.length - 1;
        const upto = state.progress * total;
        ctx.globalAlpha = state.alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const [width, alpha] of [[10, 0.12], [4, 0.35], [1.6, 1]] as const) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = state.alpha * alpha;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(pts[0]!.x, pts[0]!.y);
          for (let i = 1; i <= total; i++) {
            const k = Math.min(1, Math.max(0, upto - (i - 1)));
            if (k <= 0) break;
            const a = pts[i - 1]!;
            const b = pts[i]!;
            ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = state.alpha;
        for (let i = 0; i <= Math.min(total, Math.floor(upto)); i++) {
          const p = pts[i]!;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
          g.addColorStop(0, 'rgba(255,255,255,0.9)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
        }
      },
    });
    this.fx.push(e);
    return { state, entity: e };
  }

  private async onIgnite(score: PlacementScore, scoreAfter: number): Promise<void> {
    const scene = this.scene;
    const hud = scene.hud;
    const target = scene.night.target;
    const lineFx: { state: { progress: number; alpha: number }; entity: Entity }[] = [];

    for (const line of score.lines) {
      const firstCard = this.cardEntityAt(line.cells[0]!);
      const suit = firstCard !== undefined ? this.world.req(firstCard, CardView).card.suit : 'star';
      const color = SUIT_COLORS[suit].light;
      const center = this.lineCenter(line);

      // Карты линии загораются, рисуется созвездие
      for (const cell of line.cells) {
        const e = this.cardEntityAt(cell);
        if (e === undefined) continue;
        const v = this.world.req(e, CardView);
        v.glowColor = SUIT_COLORS[v.card.suit].main;
        void this.tweens.to(v, { glow: 1 }, { duration: 0.2 / this.speed });
      }
      const fx = this.drawConstellation(line, color);
      lineFx.push(fx);
      this.audio.ignite(score.lines.length);
      await this.tweens.to(fx.state, { progress: 1 }, { duration: 0.35 / this.speed, ease: 'inOutQuad' });

      const comboStep = line.steps[0]!;
      hud.showCalc(line.combo, comboStep.lightAfter, comboStep.multAfter);
      hud.setCaption(t('calc.combo', { combo: t(`combo.${line.combo}`), light: num(comboStep.lightAfter), mult: fmtX(comboStep.multAfter) }));
      floatText(this.world, center.x, center.y, t(`combo.${line.combo}`).toUpperCase(), { size: 26, display: true, color: '#fff', life: 1.1, rise: 24 });
      await this.wait(0.3);

      const steps = line.steps.slice(1);
      const stepDelay = Math.min(0.34, Math.max(0.14, 0.34 - steps.length * 0.01));
      const seenCells = new Set<number>();
      for (let i = 0; i < steps.length; i++) {
        await this.showStep(steps[i]!, i, seenCells);
        await this.wait(stepDelay * this.stepPause);
      }
      hud.setCalcTotal(line.total);
      hud.setCaption(t('calc.lineTotal', { light: num(line.light), mult: fmtX(line.mult), total: num(line.total) }));
      floatText(this.world, center.x, center.y + 4, num(line.total), { size: 30, display: true, color: UI.gold, life: 1, rise: 30 });
      this.audio.count(steps.length + 2, 'light');
      await this.wait(0.35);
    }

    // Шаги хода: цепь, Знамения уровня хода
    const sum = score.lines.reduce((s, l) => s + l.total, 0);
    if (score.steps.length > 0) {
      hud.setCalcLabel(score.lines.length >= 2 ? t('night.cross') : t('night.score'));
      hud.setCalc(sum, 1);
      for (let i = 0; i < score.steps.length; i++) {
        const step = score.steps[i]!;
        const board = scene.layout.board;
        const bc = { x: board.x + board.w / 2, y: board.y + board.h / 2 };
        let anchor: Pt = bc;
        if (step.source.kind === 'omen') anchor = hud.pulseOmen(step.source.uid) ?? bc;
        const label = step.source.kind === 'chain' ? t('night.chain', { n: step.xMult ?? 1 }) : `×${fmtX(step.xMult ?? 1)}`;
        floatText(this.world, anchor.x, anchor.y + (anchor === bc ? 0 : 30), label, { size: step.source.kind === 'chain' ? 40 : 30, display: true, color: UI.mult, life: 1.2 });
        hud.setCalc(sum, step.multAfter, 'mult');
        hud.setCalcTotal(Math.floor(sum * step.multAfter));
        hud.setCaption(
          step.source.kind === 'chain'
            ? t('calc.chain', { n: step.source.lines, x: fmtX(step.xMult ?? 1) })
            : this.sourceCaption(step),
        );
        this.audio.count(10 + i, 'xmult');
        shake(this.world, 0.25);
        await this.wait(0.45);
      }
    }

    // Итог влетает в счёт
    const board = scene.layout.board;
    if (score.lines.length > 1 || score.xMult !== 1) {
      floatText(this.world, board.x + board.w / 2, board.y + board.h / 2, `+${num(score.total)}`, { size: 44, display: true, color: UI.gold, life: 1.2 });
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
      case 'omen':
        return t('calc.omen', { name: named('omen', src.omenId).name, effect });
      case 'boss':
        return t('calc.boss', { name: named('boss', src.bossId).name, effect });
      default:
        return effect;
    }
  }

  /** Огоньки летят от карт созвездия к счёту — видно, куда ушли очки. */
  private async flyToScore(cells: number[]): Promise<void> {
    const target = this.scene.hud.scoreAnchor();
    const jobs: Promise<void>[] = [];
    const unique = [...new Set(cells)];
    unique.forEach((cell, i) => {
      const from = this.cellPos(cell);
      const e = this.cardEntityAt(cell);
      const color = e !== undefined ? SUIT_COLORS[this.world.req(e, CardView).card.suit].light : '#fff';
      for (let k = 0; k < 2; k++) {
        const orb = this.world.create();
        const tr = this.world.add(orb, Transform, transform(from.x + (k - 0.5) * 12, from.y, { scale: 1 }));
        this.world.add(orb, Drawable, {
          layer: Layer.Popups,
          z: 1,
          visible: true,
          draw: (ctx, t) => {
            const r = 9 * t.scale;
            const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 2.2);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.3, color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = t.alpha;
            ctx.fillStyle = g;
            ctx.fillRect(t.x - r * 2.2, t.y - r * 2.2, r * 4.4, r * 4.4);
          },
        });
        const delay = (i * 0.04 + k * 0.05) / this.speed;
        const dur = 0.45 / this.speed;
        // Дуга: сначала чуть вверх-вбок, потом в счёт
        const mid = { x: (from.x + target.x) / 2 + (Math.random() - 0.5) * 120, y: Math.min(from.y, target.y) - 30 };
        jobs.push(
          this.tweens
            .to(tr, { x: mid.x, y: mid.y }, { duration: dur * 0.45, delay, ease: 'outQuad' })
            .then(() => this.tweens.to(tr, { x: target.x, y: target.y, scale: 0.4 }, { duration: dur * 0.55, ease: 'inQuad' }))
            .then(() => {
              this.world.destroy(orb);
              this.audio.tick();
            }),
        );
      }
    });
    await Promise.race([Promise.all(jobs), this.wait(1.2)]);
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
    const src = step.source;
    if (src.kind === 'card' || src.kind === 'glyph') {
      anchor = this.cellPos(src.cell);
      cardEntity = this.cardEntityAt(src.cell);
    } else if (src.kind === 'omen') {
      const omenPos = hud.pulseOmen(src.uid);
      if (src.cell !== undefined) {
        anchor = this.cellPos(src.cell);
        cardEntity = this.cardEntityAt(src.cell);
      } else anchor = omenPos ? { x: omenPos.x, y: omenPos.y + 26 } : null;
    } else if (src.kind === 'boss') {
      const b = hud.bossAnchor();
      anchor = { x: b.x, y: b.y + 26 };
    }
    anchor ??= { x: scene.layout.board.x + scene.layout.board.w / 2, y: scene.layout.board.y };

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
    const offY = cardEntity !== undefined ? -scene.layout.cardH * 0.35 : 0;
    floatText(this.world, anchor.x, anchor.y + offY, text, { size: kind === 'xmult' ? 30 : 22, color, life: 0.8 });
    hud.setCalc(step.lightAfter, step.multAfter, kind === 'light' ? 'light' : kind === 'gold' ? undefined : 'mult');
    this.audio.count(index, kind);
    if (kind === 'xmult') shake(this.world, 0.15);
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
