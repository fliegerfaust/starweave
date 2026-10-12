/**
 * Синтезатор звуков на Web Audio. Ни одного аудиофайла: колокольчики, шорохи и
 * эмбиент генерируются осцилляторами и шумом, через общий ревербератор.
 */

/** Пентатоника (до мажор): любые сочетания звучат консонансно. */
const PENTATONIC = [0, 2, 4, 7, 9];

export function pentatonicFreq(step: number, base = 261.63): number {
  const octave = Math.floor(step / PENTATONIC.length);
  const degree = PENTATONIC[((step % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]!;
  return base * 2 ** (octave + degree / 12);
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  delay?: number;
  /** Конечная частота — для свипов. */
  slideTo?: number;
  detune?: number;
  wet?: number;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuffer!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicStep = 0;

  sfxVolume = 0.8;
  musicVolume = 0.4;

  /** AudioContext создаётся только после жеста пользователя (политика браузеров). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.music.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Временная тишина (реклама, свёрнутая вкладка) — громкости из настроек не трогает. */
  setMuted(muted: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    if (muted) void this.ctx.suspend().catch(() => undefined);
    else void this.ctx.resume().catch(() => undefined);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music, this.ctx.currentTime, 0.3);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
    return buffer;
  }

  private tone(o: ToneOptions, bus: GainNode = this.sfx): void {
    const ctx = this.ctx;
    if (!ctx || this.sfxVolume <= 0 && bus === this.sfx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.duration);
    if (o.detune) osc.detune.value = o.detune;
    const env = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(env);
    env.connect(bus);
    if ((o.wet ?? 0.5) > 0) {
      const send = ctx.createGain();
      send.gain.value = o.wet ?? 0.5;
      env.connect(send).connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + o.duration + 0.05);
  }

  private noise(duration: number, from: number, to: number, gain = 0.15, delay = 0, q = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + duration * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(env).connect(this.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    env.connect(send).connect(this.reverb);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  /** Колокольчик для карты: высота по рангу. */
  bell(rank: number, delay = 0): void {
    const f = pentatonicFreq(rank + 4);
    this.tone({ freq: f, duration: 1.2, type: 'sine', gain: 0.16, delay });
    this.tone({ freq: f * 2.01, duration: 0.6, type: 'sine', gain: 0.05, delay });
    this.tone({ freq: f * 3.98, duration: 0.25, type: 'triangle', gain: 0.02, delay });
  }

  tick(delay = 0): void {
    this.tone({ freq: 1800, duration: 0.04, type: 'square', gain: 0.025, delay, wet: 0 });
  }

  hover(): void {
    this.tone({ freq: 1200, duration: 0.05, type: 'sine', gain: 0.03, wet: 0.1 });
  }

  pickup(): void {
    this.noise(0.12, 2000, 5000, 0.05);
    this.tone({ freq: 700, duration: 0.08, type: 'triangle', gain: 0.05, slideTo: 1000, wet: 0.1 });
  }

  /** Шелест и подъём при вспышке линии. */
  ignite(lines: number): void {
    this.noise(0.6, 400, 6000, 0.12, 0, 0.8);
    const root = 6;
    [0, 2, 4, 7].forEach((step, i) => this.tone({ freq: pentatonicFreq(root + step), duration: 1.4, gain: 0.07, delay: i * 0.05 }));
    if (lines >= 2) [9, 11].forEach((s, i) => this.tone({ freq: pentatonicFreq(root + s), duration: 1.6, gain: 0.08, delay: 0.25 + i * 0.07 }));
  }

  /** Блип подсчёта: высота растёт с номером шага. */
  count(step: number, kind: 'light' | 'mult' | 'xmult' | 'gold' = 'light'): void {
    const f = pentatonicFreq(8 + Math.min(step, 14));
    if (kind === 'light') this.tone({ freq: f, duration: 0.18, type: 'triangle', gain: 0.07, wet: 0.2 });
    else if (kind === 'mult') {
      this.tone({ freq: f / 2, duration: 0.3, type: 'sawtooth', gain: 0.04, wet: 0.3 });
      this.tone({ freq: f, duration: 0.25, type: 'sine', gain: 0.07 });
    } else if (kind === 'xmult') {
      this.tone({ freq: f / 4, duration: 0.6, type: 'sawtooth', gain: 0.06, slideTo: f / 2 });
      [0, 4, 7].forEach((st) => this.tone({ freq: f * 2 ** (st / 12), duration: 0.6, gain: 0.06 }));
    } else this.coin();
  }

  coin(delay = 0): void {
    this.tone({ freq: 1568, duration: 0.12, type: 'square', gain: 0.03, delay, wet: 0.2 });
    this.tone({ freq: 2093, duration: 0.3, type: 'square', gain: 0.03, delay: delay + 0.07, wet: 0.3 });
  }

  /** Итог хода влетает в счёт: чем больше, тем ниже и мощнее. */
  impact(power: number): void {
    const p = Math.min(1, power);
    this.tone({ freq: 90 - p * 30, duration: 0.5 + p * 0.5, type: 'sine', gain: 0.25 + p * 0.15, slideTo: 40, wet: 0.2 });
    this.noise(0.4 + p * 0.4, 3000, 300, 0.08 + p * 0.08);
  }

  burn(): void {
    this.noise(0.5, 3000, 300, 0.12, 0, 0.6);
    this.tone({ freq: 400, duration: 0.4, type: 'sawtooth', gain: 0.03, slideTo: 120, wet: 0.2 });
  }

  shatter(): void {
    for (let i = 0; i < 6; i++) this.tone({ freq: 2500 + Math.random() * 3000, duration: 0.15, type: 'square', gain: 0.02, delay: i * 0.025 });
    this.noise(0.3, 6000, 2000, 0.1);
  }

  click(): void {
    this.tone({ freq: 880, duration: 0.07, type: 'triangle', gain: 0.06, wet: 0.15 });
  }

  deny(): void {
    this.tone({ freq: 220, duration: 0.15, type: 'square', gain: 0.04, wet: 0 });
    this.tone({ freq: 185, duration: 0.2, type: 'square', gain: 0.04, delay: 0.08, wet: 0 });
  }

  win(): void {
    [0, 2, 4, 5, 7, 10].forEach((s, i) => this.tone({ freq: pentatonicFreq(8 + s), duration: 1.5, gain: 0.1, delay: i * 0.09 }));
  }

  lose(): void {
    [7, 4, 2, 0].forEach((s, i) => this.tone({ freq: pentatonicFreq(4 + s) * 0.94, duration: 1.4, type: 'triangle', gain: 0.08, delay: i * 0.22 }));
  }

  /** Тихий генеративный эмбиент: редкие колокольчики и бас-гудение. */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const playStep = () => {
      if (!this.ctx || this.musicVolume <= 0) return;
      const s = this.musicStep++;
      if (s % 8 === 0) {
        const root = [0, -3, 2, -1][Math.floor(s / 8) % 4]!;
        this.tone({ freq: pentatonicFreq(root, 65.41), duration: 7, type: 'sine', gain: 0.12, attack: 2, wet: 0.6 }, this.music);
        this.tone({ freq: pentatonicFreq(root + 2, 130.81), duration: 6, type: 'triangle', gain: 0.03, attack: 2.5, wet: 0.8 }, this.music);
      }
      if (Math.random() < 0.55) {
        const step = 5 + Math.floor(Math.random() * 8);
        this.tone({ freq: pentatonicFreq(step), duration: 2.5, type: 'sine', gain: 0.035, attack: 0.02, wet: 0.9 }, this.music);
      }
    };
    playStep();
    this.musicTimer = window.setInterval(playStep, 900);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
