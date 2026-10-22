export type RuleErrorCode =
  | 'notNight'
  | 'notMap'
  | 'noCard'
  | 'cellTaken'
  | 'noBurns'
  | 'noReward'
  | 'notShop'
  | 'notVictory'
  | 'noGold'
  | 'nothing'
  | 'noSlots'
  | 'noOmen'
  | 'noSlot'
  | 'badTargets'
  | 'badTarget'
  | 'ritualUnavailable'
  /** Развилка главы: путь ещё не выбран. */
  | 'noRoute';

/** Недопустимое действие игрока. UI переводит код в подсказку, а не падает. */
export class RuleError extends Error {
  constructor(readonly code: RuleErrorCode) {
    super(code);
  }
}

/**
 * Полнота `switch` по союзу: новый вариант без ветки — ошибка типов, а не тихий пропуск.
 * В рантайме сюда попадает только чужое значение (сохранение новой сборки на старой).
 */
export function assertNever(value: never, what: string): never {
  throw new Error(`Unhandled ${what}: ${JSON.stringify(value)}`);
}
