/**
 * Тактильные отклики. Три пути, по убыванию качества:
 * 1. Нативная обёртка (Capacitor Haptics) — настоящий Taptic Engine на iPhone и
 *    точные эффекты на Android, когда игра выйдет в сторы.
 * 2. Android в браузере — `navigator.vibrate` с узором.
 * 3. iPhone в браузере (iOS 18+) — у `<input type="checkbox" switch>` системный
 *    тактильный щелчок при переключении; щёлкаем скрытый переключатель. iOS даёт
 *    щелчок только синхронно внутри касания, поэтому отклики после анимаций там
 *    невозможны — для iPhone вызывающий код зовёт `touch()` прямо в обработчике.
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

/** Сколько «щелчков» iOS-переключателя изобразят узор. */
const IOS_TICKS: Record<HapticKind, number> = { tap: 1, select: 1, place: 1, ignite: 2, cross: 3, success: 3, error: 2, heavy: 2 };

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
  private readonly isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    try {
      const native = nativeHaptics();
      if (native) return this.playNative(native, kind);
      if (typeof navigator.vibrate === 'function' && !this.isIOS) {
        // До первого касания браузер запретит вибрацию и насорит в консоль
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        navigator.vibrate(PATTERNS[kind]);
        return;
      }
      if (this.isIOS) this.playIOS(kind);
    } catch {
      /* тактильность — приятный бонус, ошибки не важны */
    }
  }

  /**
   * Отклик в момент касания — только для iPhone в браузере, где позже он уже не сработает.
   * На остальных устройствах ничего не делает: там тот же отклик придёт через `play()`
   * точно в такт анимации, и двойной вибрации не будет.
   */
  touch(kind: HapticKind): void {
    if (!this.enabled || !this.isIOS || nativeHaptics()) return;
    try {
      this.playIOS(kind);
    } catch {
      /* см. play() */
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

  /**
   * iOS 18+: щелчок системного переключателя `<input type="checkbox" switch>` даёт тактильный
   * отклик. Как в проверенной библиотеке ios-haptics: каждый раз свежий переключатель внутри
   * `<label>`, клик по метке и удаление. Работает только синхронно внутри завершённого касания
   * (pointerup / click) — нажатие (pointerdown) для iOS ещё не «жест».
   */
  private playIOS(kind: HapticKind): void {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    this.tickIOS();
    for (let i = 1; i < IOS_TICKS[kind]; i++) window.setTimeout(() => this.tickIOS(), i * 70);
  }

  private tickIOS(): void {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  }
}
