import { CARD_ASPECT, CARD_PAD, cardBack } from '@/art/card';
import { skyTheme, SKY_THEMES } from '@/art/cosmetics';
import { Starfield } from '@/game/starfield';
import { dpr } from './dom';

/**
 * Живая витрина внешнего вида: настоящее небо выбранной темы (с её созвездиями и
 * эффектом) и веер из трёх карт с выбранной рубашкой, по которым пробегает блик.
 * Кадры идут, пока витрина на экране; `destroy()` останавливает цикл.
 */
export class PreviewStage {
  readonly el: HTMLCanvasElement;
  private readonly sky = new Starfield();
  private back = 'classic';
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 0;
  private h = 0;
  private scale = 1;
  private readonly ro: ResizeObserver;

  constructor(
    private readonly opts: { cards?: number; reduceMotion?: boolean } = {},
  ) {
    this.el = document.createElement('canvas');
    this.el.className = 'preview-stage';
    this.el.setAttribute('aria-hidden', 'true');
    if (import.meta.env.DEV) (this.el as unknown as { stage: PreviewStage }).stage = this;
    // Примерка: небо сменяется за треть секунды, а не за две, как между созвездиями
    this.sky.fadeRate = 3;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.raf = requestAnimationFrame(this.frame);
  }

  setSky(id: string): void {
    this.sky.setTheme(id, skyTheme(id).palette, SKY_THEMES.findIndex((t) => t.id === id));
  }

  setBack(id: string): void {
    this.back = id;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width;
    this.h = r.height;
    this.scale = dpr();
    this.el.width = Math.round(r.width * this.scale);
    this.el.height = Math.round(r.height * this.scale);
    this.sky.resize(r.width, r.height, this.scale);
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.w) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    const still = this.opts.reduceMotion;
    this.time += still ? 0 : dt;
    this.sky.update(still ? 0 : dt);
    const ctx = this.el.getContext('2d')!;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.sky.draw(ctx, this.time);
    this.drawCards(ctx);
  };

  private drawCards(ctx: CanvasRenderingContext2D): void {
    const n = this.opts.cards ?? 3;
    if (!n) return;
    const cw = Math.min(this.w * 0.24, this.h * 0.42);
    const ch = cw / CARD_ASPECT;
    const img = cardBack(Math.round(cw), this.scale, this.back);
    const pad = Math.ceil(cw * CARD_PAD);
    const cx = this.w / 2;
    const cy = this.h * 0.56;
    const float = Math.sin(this.time * 1.1) * 4;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      ctx.save();
      ctx.translate(cx + k * cw * 0.55, cy + Math.abs(k) * cw * 0.12 + float * (i === 1 ? 1 : 0.6));
      ctx.rotate(k * 0.22);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(img, -cw / 2 - pad, -ch / 2 - pad, cw + pad * 2, ch + pad * 2);
      ctx.shadowColor = 'transparent';
      // Блик, пробегающий по карте раз в несколько секунд
      const phase = ((this.time * 0.35 + i * 0.12) % 1.6) - 0.3;
      if (phase > -0.3 && phase < 1.3) {
        ctx.beginPath();
        ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.09);
        ctx.clip();
        const x = -cw / 2 + phase * cw * 1.6;
        const g = ctx.createLinearGradient(x - cw * 0.3, 0, x + cw * 0.3, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.rotate(0.35);
        ctx.fillStyle = g;
        ctx.fillRect(-cw * 1.5, -ch, cw * 3, ch * 2);
      }
      ctx.restore();
    }
  }
}
