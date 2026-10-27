import { describe, expect, it } from 'vitest';
import { computeHall, HALL_TTL_MS, HallCache } from '../server/src/hall.ts';
import { insertBatch, openDb } from '../server/src/db.ts';
import { dailyStreak, FEATS, featStates, nearestFeat, percentileOf } from '../src/meta/achievements';
import { hallSnapshot, hallView, PRIOR_WEIGHT, TIER_PRIOR, toHallStats } from '../src/meta/hall-sync';
import { emptyProfile, type Profile } from '../src/meta/profile';

const NOW = Date.UTC(2026, 9, 28, 12);
const DAY = 86_400_000;

function seasoned(over: Partial<Profile> = {}): Profile {
  return { ...emptyProfile(), runs: 5, wins: 1, bestAnte: 8, bestPlacement: 1200, totalLines: 150, eclipses: 3, crossFound: true, ...over };
}

describe('Зал славы: достижения по профилю', () => {
  it('серия вызова дня — самая длинная полоса дней подряд', () => {
    const archive = Object.fromEntries(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'].map((d) => [d, { ante: 2, best: 100 }]));
    expect(dailyStreak({ ...emptyProfile(), archive })).toBe(3);
    expect(dailyStreak(emptyProfile())).toBe(0);
  });

  it('открытые достижения считаются по профилю', () => {
    const done = new Set(featStates(seasoned()).filter((s) => s.done).map((s) => s.def.id));
    expect(done).toContain('firstRun');
    expect(done).toContain('firstWin');
    expect(done).toContain('move1k');
    expect(done).toContain('cross');
    expect(done).not.toContain('move5k');
  });

  it('мифы и трофеи скрыты, пока их ступень закрыта', () => {
    const fresh = featStates(seasoned());
    expect(fresh.find((s) => s.def.id === 'mythsAll')!.secret).toBe(true);
    expect(fresh.find((s) => s.def.id === 'tameAll')!.secret).toBe(true);
    // Открытое достижение никогда не скрыто
    const tamed = featStates(seasoned({ tamed: { void: 1 } }));
    expect(tamed.find((s) => s.def.id === 'tame')!).toMatchObject({ done: true, secret: false });
  });

  it('ближайшее — неоткрытое с наибольшей долей пути', () => {
    const near = nearestFeat(featStates(seasoned({ bestPlacement: 4800 })));
    expect(near?.def.id).toBe('move5k');
  });

  it('процентиль по порогам: ноль и пустые пороги — без места', () => {
    const thr = Array.from({ length: 101 }, (_, q) => q * 10);
    expect(percentileOf(thr, 505)).toBe(50);
    expect(percentileOf(thr, 0)).toBeNull();
    expect(percentileOf(undefined, 10)).toBeNull();
    expect(percentileOf(thr, 99_999)).toBe(99);
  });
});

describe('Зал славы: снимок и ответ сервера', () => {
  it('маска снимка — биты по номерам FEATS', () => {
    const snap = hallSnapshot(seasoned());
    const done = featStates(seasoned()).map((s) => s.done);
    done.forEach((d, i) => expect(Math.floor(snap.f / 2 ** i) % 2 === 1).toBe(d));
    expect(snap).toMatchObject({ bm: 1200, ba: 8, w: 1, l: 150, e: 3 });
  });

  it('ответ сервера переводится в доли по именам, мусор отбрасывается', () => {
    const stats = toHallStats({ players: 50, feats: [90, 40], records: { bestMove: Array(101).fill(5), bad: [1, 2] } })!;
    expect(stats.feats[FEATS[0]!.id]).toBe(90);
    expect(stats.feats[FEATS[1]!.id]).toBe(40);
    expect(stats.feats[FEATS[2]!.id]).toBe(0);
    expect(stats.records.bestMove).toHaveLength(101);
    expect('bad' in stats.records).toBe(false);
    expect(toHallStats({ nope: 1 })).toBeNull();
  });

  it('доли сглажены редкостью ступени: без данных — заложенная, с данными — к настоящей', () => {
    const legend = FEATS.find((f) => f.tier === 3)!;
    expect(hallView(null).feats[legend.id]).toBeCloseTo(TIER_PRIOR[3]);
    expect(hallView(null).records).toEqual({});
    const many = hallView({ players: PRIOR_WEIGHT * 100, feats: { [legend.id]: 10 }, records: { bestMove: Array(101).fill(1) } });
    expect(many.feats[legend.id]).toBeGreaterThan(9.8);
    expect(many.records.bestMove).toHaveLength(101);
  });
});

describe('Зал славы: подсчёт на сервере', () => {
  const snap = (client: string, at: number, params: Record<string, number>) =>
    insertBatch(db, { client, session: 'ssssssss', platform: 'web', version: '0.7.11', lang: 'ru', events: [{ name: 'hall_snap', params, at }] });
  const db = openDb(':memory:');
  const a = 'aaaaaaaa-0000';
  const b = 'bbbbbbbb-0000';
  snap(a, NOW - 5 * DAY, { f: 1, bm: 100 });
  snap(a, NOW - DAY, { f: 3, bm: 900 }); // последний снимок a — он и считается
  snap(b, NOW - 2 * DAY, { f: 1, bm: 300 });
  snap('cccccccc-0000', NOW - 200 * DAY, { f: 7, bm: 5000 }); // вне окна

  it('берёт последний снимок каждого устройства за окно', () => {
    const hall = computeHall(db, NOW);
    expect(hall.players).toBe(2);
    expect(hall.feats).toEqual([100, 50]);
    expect(hall.records.bestMove).toHaveLength(101);
    expect(hall.records.bestMove![0]).toBe(300);
    expect(hall.records.bestMove![100]).toBe(900);
  });

  it('кэш пересчитывает не чаще раза в час', () => {
    const cache = new HallCache(db);
    const first = cache.json(NOW);
    snap('dddddddd-0000', NOW, { f: 0, bm: 1 });
    expect(cache.json(NOW + 1000)).toBe(first);
    expect(JSON.parse(cache.json(NOW + HALL_TTL_MS)).players).toBe(3);
  });
});
