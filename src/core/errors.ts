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
  | 'ritualUnavailable';

/** Недопустимое действие игрока. UI переводит код в подсказку, а не падает. */
export class RuleError extends Error {
  constructor(readonly code: RuleErrorCode) {
    super(code);
  }
}
