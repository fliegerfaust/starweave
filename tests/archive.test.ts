import { describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { archiveDates, dailyNumber, dailySeed, emptyProfile, FIRST_DAILY, recordRunEnd } from '../src/meta/profile';

describe('архив вызовов дня', () => {
  it('прошедшие дни — от вчера до первого вызова', () => {
    const dates = archiveDates('2026-10-04');
    expect(dates).toEqual(['2026-10-03', '2026-10-02', FIRST_DAILY]);
    expect(archiveDates(FIRST_DAILY)).toEqual([]);
    // Через границу месяца
    expect(archiveDates('2026-11-02').slice(0, 3)).toEqual(['2026-11-01', '2026-10-31', '2026-10-30']);
  });

  it('номер дня считается от первого вызова', () => {
    expect(dailyNumber(FIRST_DAILY)).toBe(1);
    expect(dailyNumber('2026-10-13')).toBe(13);
    expect(dailyNumber('2027-03-28')).toBe(dailyNumber(new Date(2027, 2, 28)));
  });

  it('вызов из архива — тот же расклад, что был в тот день', () => {
    const date = '2026-10-05';
    const archived = newRun({ seed: dailySeed(date), daily: true, dailyDate: date, archive: true });
    const original = newRun({ seed: dailySeed(date), daily: true, dailyDate: date });
    expect(archived.deck).toEqual(original.deck);
    expect(archived.bosses).toEqual(original.bosses);
    expect(archived.archive).toBe(true);
    expect(deserializeRun(serializeRun(archived))!.dailyDate).toBe(date);
  });

  it('итог из архива не трогает сегодняшний вызов и хранит лучший результат', () => {
    const p = emptyProfile();
    const date = '2026-10-05';
    const run = newRun({ seed: dailySeed(date), daily: true, dailyDate: date, archive: true });
    run.ante = 4;
    run.stats.bestPlacement = 900;
    recordRunEnd(p, run, false);
    expect(p.daily).toBeNull();
    expect(p.archive?.[date]).toEqual({ ante: 4, best: 900 });

    const worse = newRun({ seed: dailySeed(date), daily: true, dailyDate: date, archive: true });
    worse.ante = 2;
    worse.stats.bestPlacement = 300;
    recordRunEnd(p, worse, false);
    expect(p.archive?.[date]).toEqual({ ante: 4, best: 900 });
  });

  it('вызов дня записывается на свою дату, даже если доигран после полуночи', () => {
    const p = emptyProfile();
    const run = newRun({ seed: dailySeed('2026-10-07'), daily: true, dailyDate: '2026-10-07' });
    run.ante = 3;
    recordRunEnd(p, run, true);
    expect(p.daily?.date).toBe('2026-10-07');
    expect(p.archive?.['2026-10-07']).toMatchObject({ ante: 3, won: true });
  });
});

describe('Астролябия', () => {
  it('шесть карт с разными глифами, расклад зависит от сида', async () => {
    const { GLYPHS } = await import('../src/core/types');
    const a = newRun({ seed: 11, skyId: 'astrolabe' });
    const glyphs = a.deck.filter((c) => c.glyph).map((c) => c.glyph).sort();
    expect(glyphs).toEqual([...GLYPHS].sort());
    expect(a.gold).toBe(0);
    expect(newRun({ seed: 11, skyId: 'astrolabe' }).deck).toEqual(a.deck);
  });

  it('открывается только атласом', async () => {
    const { skyDef } = await import('../src/core/content/skies');
    const { isUnlocked, refreshUnlocks } = await import('../src/meta/profile');
    const p = emptyProfile();
    p.wins = 99;
    p.bestAnte = 8;
    p.totalLines = 9999;
    expect(isUnlocked(skyDef('astrolabe').unlock, p)).toBe(false);
    expect(isUnlocked(skyDef('astrolabe').unlock, p, new Set(['atlas']))).toBe(true);
    expect(refreshUnlocks(p)).not.toContain('astrolabe');
  });
});
