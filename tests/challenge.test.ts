import { describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { challengeOf, compareToChallenge, encodeChallenge, parseStartParam } from '../src/game/challenge';

describe('вызов другу', () => {
  it('ссылка разбирается обратно в тот же вызов и влезает в параметр Telegram', () => {
    const c = { seed: 2 ** 32 - 1, skyId: 'astrolabe', stake: 5, ante: 9, best: 123456 };
    const param = encodeChallenge(c);
    expect(param).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(parseStartParam(param)).toEqual({ challenge: c });
  });

  it('вызов берёт сид, небо и звёздность забега; победа — глава 9', () => {
    const run = newRun({ seed: 777, skyId: 'twins', stake: 2 });
    run.ante = 4;
    run.stats.bestPlacement = 512;
    expect(challengeOf(run, false)).toEqual({ seed: 777, skyId: 'twins', stake: 2, ante: 4, best: 512 });
    expect(challengeOf(run, true).ante).toBe(9);
  });

  it('тот же сид даёт тот же расклад', () => {
    const a = newRun({ seed: 4242, skyId: 'classic' });
    const b = newRun({ seed: 4242, skyId: 'classic' });
    expect(b.deck).toEqual(a.deck);
    expect(b.bosses).toEqual(a.bosses);
  });

  it('метка источника и мусор', () => {
    expect(parseStartParam('src_tgads1')).toEqual({ source: 'tgads1' });
    expect(parseStartParam(null)).toEqual({});
    expect(parseStartParam('c_zz_nosuchsky_0_1_1')).toEqual({});
    expect(parseStartParam('c_1_classic_0_0_1')).toEqual({});
    expect(parseStartParam('c_1_classic_0_1')).toEqual({});
    expect(parseStartParam('c_1_classic_0_1_1<script>')).toEqual({});
    expect(parseStartParam('x'.repeat(65))).toEqual({});
  });

  it('сравнение: сначала глава, потом лучший ход', () => {
    const c = { ante: 3, best: 400 };
    expect(compareToChallenge(c, 4, 10)).toBe(1);
    expect(compareToChallenge(c, 2, 9999)).toBe(-1);
    expect(compareToChallenge(c, 3, 401)).toBe(1);
    expect(compareToChallenge(c, 3, 400)).toBe(0);
  });

  it('итог друга переживает сохранение забега', () => {
    const run = newRun({ seed: 1, skyId: 'classic' });
    run.challenge = { ante: 3, best: 400 };
    expect(deserializeRun(serializeRun(run))?.challenge).toEqual({ ante: 3, best: 400 });
  });
});
