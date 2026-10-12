/**
 * Тактильные отклики. Два пути, по убыванию качества:
 * 1. Нативная обёртка (Capacitor Haptics) — настоящий Taptic Engine на iPhone и
 *    точные эффекты на Android, когда игра выйдет в сторы.
 * 2. Android в браузере — `navigator.vibrate` с узором.
 * На iPhone в браузере вибрации нет: `navigator.vibrate` там не существует, а трюк с системным
 * переключателем (iOS 18) в iOS 26 не срабатывает ни в Safari, ни в Chrome — проверено на
 * iPhone 15 в 0.3.3. Отклики на iPhone придут с нативной сборкой (Capacitor Haptics).
 * Если ничего нет — молча ничего не делаем.
 */

export type HapticKind = 'tap' | 'select' | 'place' | 'ignite' | 'cross' | 'success' | 'error' | 'heavy';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 6,
  select: 10,
  place: 14,
  ignite: 24,
  cross: [22, 40, 34],
  success: [16, 50, 16, 50, 34],
  error: [40, 30, 40],
  heavy: 55,
};

interface NativeHaptics {
  impact(opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
  notification(opts: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>;
  selectionChanged?(): Promise<void>;
}

function nativeHaptics(): NativeHaptics | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: NativeHaptics } } }).Capacitor;
  return cap?.Plugins?.Haptics ?? null;
}

export class Haptics {
  enabled = true;

  /** Есть ли на устройстве хоть какой-то способ вибрации — иначе настройку не показываем. */
  static supported(): boolean {
    return !!nativeHaptics() || typeof navigator.vibrate === 'function';
  }

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    try {
      const native = nativeHaptics();
      if (native) return this.playNative(native, kind);
      if (typeof navigator.vibrate === 'function') {
        // До первого касания браузер запретит вибрацию и насорит в консоль
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        navigator.vibrate(PATTERNS[kind]);
      }
    } catch {
      /* тактильность — приятный бонус, ошибки не важны */
    }
  }

  private playNative(native: NativeHaptics, kind: HapticKind): void {
    switch (kind) {
      case 'success':
        void native.notification({ type: 'SUCCESS' });
        break;
      case 'error':
        void native.notification({ type: 'ERROR' });
        break;
      case 'select':
      case 'tap':
        if (native.selectionChanged) void native.selectionChanged();
        else void native.impact({ style: 'LIGHT' });
        break;
      case 'place':
        void native.impact({ style: 'LIGHT' });
        break;
      case 'ignite':
        void native.impact({ style: 'MEDIUM' });
        break;
      case 'cross':
      case 'heavy':
        void native.impact({ style: 'HEAVY' });
        window.setTimeout(() => void native.impact({ style: 'MEDIUM' }), 90);
        break;
    }
  }
}
