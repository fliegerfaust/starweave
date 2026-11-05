/** 0 — полный слой, 1 — облегчённый, 2 — выключен, эффекты прежние. */
export type FxLevel = 0 | 1 | 2;

/** Кадр дольше этого считается плохим: 30 кадров режима экономии батареи ещё не беда. */
const SLOW_MS = 40;
/** Столько кадров эффекта судим разом. */
const WINDOW = 48;
/** Доля плохих кадров, при которой слой становится проще. */
const SLOW_SHARE = 0.4;
/** Первые кадры эффекта не считаем: там разовая загрузка текстур. */
const SKIP = 4;

/**
 * Следит за кадрами только пока идёт эффект. Если устройство не тянет, сначала снижает
 * качество, потом выключает слой; ход при этом доигрывается как обычно.
 */
export class FxGuard {
  private seen = 0;
  private slow = 0;
  private skip = SKIP;

  constructor(public level: FxLevel = 0) {}

  /** Эффекты начались после паузы. */
  begin(): void {
    this.skip = SKIP;
  }

  /** Кадр эффекта; возвращает новый уровень, если он сменился. */
  frame(ms: number): FxLevel | null {
    if (this.level >= 2) return null;
    if (this.skip > 0) {
      this.skip--;
      return null;
    }
    this.seen++;
    if (ms > SLOW_MS) this.slow++;
    if (this.seen < WINDOW) return null;
    const bad = this.slow / this.seen >= SLOW_SHARE;
    this.seen = 0;
    this.slow = 0;
    if (!bad) return null;
    this.level = (this.level + 1) as FxLevel;
    return this.level;
  }
}
