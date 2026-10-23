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
  /** Срез фильтра низких частот (Гц) — тёплые пэды и маримба. */
  lowpass?: number;
}

/**
 * Доработанное звучание (CQ.7, `music`), витрина: `a` — «Обсерватория» (колокольчики с
 * неровными обертонами, пэд и челеста по аккордам), `b` — «Шкатулка» (щипок и мелодия
 * шкатулки), `c` — «Тёплая ночь» (маримба, тёмный пэд, пульс баса). null — прежнее.
 */
export type Voice = 'a' | 'b' | 'c';

/** Нота по полутонам от до первой октавы. */
const semi = (n: number) => 261.63 * 2 ** (n / 12);
/** Аккорды Am – F – C – G: тоны (полутона от до) и бас. */
const CHORDS: { tones: number[]; bass: number }[] = [
  { tones: [-3, 0, 4], bass: -15 },
  { tones: [-7, -3, 0], bass: -19 },
  { tones: [-5, 0, 4], bass: -24 },
  { tones: [-5, -1, 2], bass: -17 },
];
/** Мелодия шкатулки на два такта (полутона, null — пауза); повторяется с аккордами. */
const BOX_TUNE: (number | null)[] = [12, 16, 19, 16, 14, 12, 9, null, 16, 19, 21, 19, 16, 14, 12, null];
/** Восьмая при 72 ударах в минуту. */
const EIGHTH = 60 / 72 / 2;

export class Synth {
  private ctx: BaseAudioContext | null = null;
  /** Свои часы вместо `ctx.currentTime` — запись ролика в OfflineAudioContext (`?capture`). */
  private clock: (() => number) | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuffer!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicStep = 0;

  /** Звучание CQ.7 (переключатель `music`); null — прежние звуки и эмбиент. */
  voice: Voice | null = null;
  sfxVolume = 0.8;
  musicVolume = 0.4;

  /** AudioContext создаётся только после жеста пользователя (политика браузеров). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    // Автотесты (Playwright) играют молча: звук из колонок мешает работать рядом.
    // Запись роликов идёт через attachOffline — её это не касается
    if (navigator.webdriver) return;
    const Ctor = window.AudioContext ??(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.build(new Ctor());
  }

  /**
   * Запись ролика: весь звук идёт в `ctx` (OfflineAudioContext), время звуков — по `clock`
   * (секунды от начала записи; отрицательное — звук до записи, его не будет).
   */
  attachOffline(ctx: OfflineAudioContext, clock: () => number): void {
    this.clock = clock;
    this.build(ctx);
  }

  private build(ctx: BaseAudioContext): void {
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
    if (!(this.ctx instanceof AudioContext)) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    if (muted) void this.ctx.suspend().catch(() => undefined);
    else void this.ctx.resume().catch(() => undefined);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, Math.max(0, this.now()), 0.05);
    this.music.gain.setTargetAtTime(music, Math.max(0, this.now()), 0.3);
  }

  private now(): number {
    return this.clock ? this.clock() : this.ctx!.currentTime;
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
    const t0 = this.now() + (o.delay ?? 0);
    if (t0 < 0) return;
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
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      osc.connect(lp).connect(env);
    } else osc.connect(env);
    env.connect(bus);
    if ((o.wet ?? 0.5) > 0) {
      const send = ctx.createGain();
      send.gain.value = o.wet ?? 0.5;
      env.connect(send).connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + o.duration + 0.05);
  }

  private noise(duration: number, from: number, to: number, gain = 0.15, delay = 0, q = 1, kind: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = this.now() + delay;
    if (t0 < 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = kind;
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
    if (this.voice === 'a') {
      // Колокольчик: неровный обертон 2,76 гаснет быстрее основы; под ним — войлочный стук карты
      this.tone({ freq: f, duration: 1.6, gain: 0.13, delay, wet: 0.55 });
      this.tone({ freq: f * 2.76, duration: 0.5, gain: 0.04, delay, wet: 0.5 });
      this.tone({ freq: f * 5.4, duration: 0.18, gain: 0.012, delay, wet: 0.4 });
      this.noise(0.09, 500, 180, 0.07, delay, 0.7, 'lowpass');
      return;
    }
    if (this.voice === 'b') {
      // Щипок шкатулки: треугольник с быстрым спадом и тихий щелчок язычка
      this.tone({ freq: f * 2, duration: 0.7, type: 'triangle', gain: 0.07, delay, wet: 0.45, lowpass: 5200 });
      this.tone({ freq: f * 4, duration: 0.2, gain: 0.02, delay, wet: 0.3 });
      this.noise(0.03, 6000, 4000, 0.03, delay, 2);
      return;
    }
    if (this.voice === 'c') {
      // Маримба: короткая основа с лёгким падением высоты и деревянный стук
      this.tone({ freq: f * 1.02, slideTo: f, duration: 0.55, gain: 0.15, delay, wet: 0.3, lowpass: 2400 });
      this.tone({ freq: f * 4, duration: 0.08, gain: 0.03, delay, wet: 0.2 });
      this.noise(0.07, 400, 160, 0.08, delay, 0.7, 'lowpass');
      return;
    }
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
    if (this.voice) {
      // Карта скользит по сукну: шорох вверх, без писка
      this.noise(0.14, 1500, 4200, 0.05, 0, 0.8, this.voice === 'c' ? 'lowpass' : 'bandpass');
      this.tone({ freq: this.voice === 'b' ? 1320 : 520, duration: 0.09, type: 'triangle', gain: 0.025, slideTo: this.voice === 'b' ? 1560 : 700, wet: 0.15 });
      return;
    }
    this.noise(0.12, 2000, 5000, 0.05);
    this.tone({ freq: 700, duration: 0.08, type: 'triangle', gain: 0.05, slideTo: 1000, wet: 0.1 });
  }

  /** Шелест и подъём при вспышке линии. */
  ignite(lines: number): void {
    if (this.voice) return this.igniteVoice(lines);
    this.noise(0.6, 400, 6000, 0.12, 0, 0.8);
    const root = 6;
    [0, 2, 4, 7].forEach((step, i) => this.tone({ freq: pentatonicFreq(root + step), duration: 1.4, gain: 0.07, delay: i * 0.05 }));
    if (lines >= 2) [9, 11].forEach((s, i) => this.tone({ freq: pentatonicFreq(root + s), duration: 1.6, gain: 0.08, delay: 0.25 + i * 0.07 }));
  }

  /** Блип подсчёта: высота растёт с номером шага. */
  count(step: number, kind: 'light' | 'mult' | 'xmult' | 'gold' = 'light'): void {
    const f = pentatonicFreq(8 + Math.min(step, 14));
    if (this.voice && kind === 'light') {
      // Шаг подсчёта: стекло (a), щипок (b) или маримба (c) — выше с каждым шагом
      if (this.voice === 'a') this.tone({ freq: f * 2, duration: 0.3, gain: 0.045, wet: 0.45 });
      else if (this.voice === 'b') this.tone({ freq: f * 2, duration: 0.35, type: 'triangle', gain: 0.05, wet: 0.4, lowpass: 5000 });
      else this.tone({ freq: f, slideTo: f * 0.98, duration: 0.3, gain: 0.08, wet: 0.25, lowpass: 2600 });
      return;
    }
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
    if (this.voice) {
      // Удар в счёт: глубокий саб без щелчка, мягкий шум и (a, b) звёздный хвост
      this.tone({ freq: 70 - p * 20, duration: 0.7 + p * 0.6, gain: 0.3 + p * 0.15, slideTo: 36, wet: 0.15, attack: 0.008 });
      this.noise(0.5 + p * 0.4, 1800, 200, 0.06 + p * 0.06, 0, 0.6, 'lowpass');
      if (this.voice !== 'c') [0, 4, 7].forEach((st, i) => this.tone({ freq: semi(24 + st), duration: 1.4, gain: 0.025 + p * 0.02, delay: 0.05 + i * 0.06, wet: 0.8 }));
      return;
    }
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

  /** Вспышка линии своим звучанием: восходящий аккорд, у креста — выше и шире. */
  private igniteVoice(lines: number): void {
    const v = this.voice!;
    this.noise(0.7, 300, 5000, v === 'c' ? 0.06 : 0.09, 0, 0.7);
    const steps = lines >= 2 ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12];
    steps.forEach((st, i) => {
      const f = semi(12 + st);
      const delay = i * (v === 'b' ? 0.07 : 0.05);
      if (v === 'a') {
        this.tone({ freq: f, duration: 1.8, gain: 0.06, delay, wet: 0.7 });
        this.tone({ freq: f * 2.76, duration: 0.5, gain: 0.015, delay, wet: 0.6 });
      } else if (v === 'b') this.tone({ freq: f * 2, duration: 1, type: 'triangle', gain: 0.05, delay, wet: 0.55, lowpass: 5000 });
      else this.tone({ freq: f, duration: 2.2, type: 'sawtooth', gain: 0.018, delay, attack: 0.15, wet: 0.7, lowpass: 1400 });
    });
    if (v === 'c') this.tone({ freq: 55, duration: 1.2, gain: 0.18, slideTo: 40, wet: 0.2 });
  }

  /** Музыка своим звучанием: такт из восьми восьмых, аккорд меняется каждый такт (c — раз в два). */
  private musicVoice(s: number): void {
    const v = this.voice!;
    const bar = Math.floor(s / 8);
    const beat = s % 8;
    const chord = CHORDS[Math.floor(v === 'c' ? bar / 2 : bar) % CHORDS.length]!;
    const barLen = EIGHTH * 8 * (v === 'c' ? 2 : 1);
    const m = this.music;
    if (beat === 0 && (v !== 'c' || bar % 2 === 0)) {
      // Пэд: две слегка расстроенные волны на тон аккорда, медленная атака, тёплый фильтр
      for (const tn of chord.tones) {
        for (const det of [-7, 7]) {
          this.tone({ freq: semi(tn), duration: barLen + 0.8, type: v === 'c' ? 'sawtooth' : 'triangle', gain: v === 'b' ? 0.012 : 0.016, attack: barLen * 0.35, detune: det, wet: 0.7, lowpass: v === 'c' ? 650 : 1300 }, m);
        }
      }
      if (v !== 'b') this.tone({ freq: semi(chord.bass), duration: barLen, gain: 0.07, attack: 0.4, wet: 0.3, lowpass: 400 }, m);
    }
    if (v === 'a' && [0, 3, 5, 6].includes(beat)) {
      // Челеста: тон аккорда на две октавы выше, по сетке, а не наугад
      const tn = chord.tones[(bar + beat) % chord.tones.length]! + 24;
      this.tone({ freq: semi(tn), duration: 1.6, gain: 0.022, wet: 0.85 }, m);
      this.tone({ freq: semi(tn) * 2.76, duration: 0.3, gain: 0.005, wet: 0.8 }, m);
    }
    if (v === 'b') {
      const note = BOX_TUNE[s % BOX_TUNE.length];
      if (note !== null && note !== undefined) this.tone({ freq: semi(note + 12), duration: 0.9, type: 'triangle', gain: 0.026, wet: 0.6, lowpass: 4800 }, m);
    }
    if (v === 'c') {
      if (beat === 4) this.tone({ freq: semi(chord.bass), duration: 0.9, gain: 0.05, attack: 0.05, wet: 0.2, lowpass: 300 }, m);
      if (s % 12 === 7) this.tone({ freq: semi(chord.tones[s % 3]! + 24), duration: 3, gain: 0.016, wet: 0.95 }, m);
    }
  }

  /** Тихий генеративный эмбиент: редкие колокольчики и бас-гудение. */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    if (this.voice) {
      const play = () => {
        if (!this.ctx || this.musicVolume <= 0) return;
        this.musicVoice(this.musicStep++);
      };
      play();
      this.musicTimer = window.setInterval(play, EIGHTH * 1000);
      return;
    }
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
