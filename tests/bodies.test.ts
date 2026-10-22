import { describe, expect, it } from 'vitest';
import { resolveLine } from '../src/core/combos';
import { BLACKHOLE_XMULT, PULSAR_CHARGE } from '../src/core/content/traits';
import { placeCard } from '../src/core/night';
import { applyRitual } from '../src/core/shop';
import type { GameEvent, RunState } from '../src/core/types';
import { cards, nightRun, setGrid, setHand } from './helpers';

/** Ночь, которую не выиграть случайно: тела проверяются на нескольких ходах подряд. */
function longNight(): RunState {
  const run = nightRun();
  run.night!.target = 1e9;
  return run;
}
const ignite = (events: GameEvent[]) => events.find((e) => e.t === 'ignite');

describe('небесные тела (GF.3)', () => {
  it('Полярная звезда остаётся на небе после вспышки', () => {
    const run = longNight();
    setGrid(run, { 0: '2s', 1: '3m', 2: '4t' });
    setHand(run, '5c@polaris 9s');
    const polaris = run.night!.hand[0]!;
    const events = placeCard(run, 0, 3);
    expect(events).toContainEqual({ t: 'cardStays', cardId: polaris.id, cell: 3 });
    expect(run.night!.grid[3]).toBe(polaris);
    expect(run.night!.grid[0]).toBeNull();
  });

  it('Метеор выбивает самого слабого соседа, но не карту своей линии', () => {
    const run = longNight();
    // Метеор в 11 закрывает ряд 8–11; соседи: 7 (1 Звезды), 10 (свой ряд), 15 (8 Луны)
    setGrid(run, { 8: '3s', 9: '3m', 10: '9t', 7: '1t', 15: '8m' });
    setHand(run, '6c@meteor 2s');
    const weak = run.night!.grid[7]!;
    const events = placeCard(run, 0, 11);
    expect(events).toContainEqual({ t: 'knocked', cardId: weak.id, cell: 7, by: 11 });
    expect(events.findIndex((e) => e.t === 'knocked')).toBeLessThan(events.findIndex((e) => e.t === 'ignite'));
    expect(run.night!.grid[7]).toBeNull();
    expect(run.night!.grid[15]).not.toBeNull();
    expect(run.night!.discard.map((c) => c.id)).toContain(weak.id);
  });

  it('Метеор без соседей ничего не выбивает', () => {
    const run = longNight();
    setHand(run, '6c@meteor');
    expect(placeCard(run, 0, 5).some((e) => e.t === 'knocked')).toBe(false);
  });

  it('Пульсар копит множитель от вспышек рядом и отдаёт его каждой линии до конца ночи', () => {
    const run = longNight();
    // Пульсар в 5; ряд 0–3 рядом с ним
    setGrid(run, { 5: '4t@pulsar', 0: '2s', 1: '6s', 3: '8s' });
    setHand(run, '4s 5m 9c 1c');
    const first = placeCard(run, 0, 2);
    expect(first).toContainEqual({ t: 'pulse', cell: 5, amount: PULSAR_CHARGE, total: PULSAR_CHARGE });
    expect(run.night!.pulse).toBe(PULSAR_CHARGE);
    // Следующая линия получает заряд отдельным шагом
    setGrid(run, { 12: '7m', 13: '7c', 14: '2t' });
    setHand(run, '9m');
    const score = ignite(placeCard(run, 0, 15));
    if (score?.t !== 'ignite') throw new Error('ждали вспышку');
    expect(score.score.lines[0]!.steps).toContainEqual(expect.objectContaining({ source: { kind: 'body', body: 'pulsar' }, mult: PULSAR_CHARGE }));
  });

  it('Двойник считается двумя рангами: одна карта — две пары', () => {
    expect(resolveLine(cards('4s 4t@twin 5m 9c')).combo).toBe('twoPair');
    expect(resolveLine(cards('4s 9m 9t 9c@twin')).combo).toBe('triple');
    // Порядок Двойник закрывает вторым рангом: 3·4·5·6
    expect(resolveLine(cards('3s 4m 4t@twin 6c')).combo).toBe('cascade');
  });

  it('Туманность встаёт тем рангом, что выгоднее линии, и светит им', () => {
    const line = resolveLine(cards('7s 7m 7c 1t@nebula'));
    expect(line.combo).toBe('quartet');
    expect(line.ranks).toEqual([7, 7, 7, 7]);
    expect(resolveLine(cards('2s 3s 4s 9s@nebula')).combo).toBe('supernova');
  });

  it('Чёрная дыра: ×множитель линии и уходит из колоды', () => {
    const run = longNight();
    setGrid(run, { 8: '6m', 9: '6s', 10: '2t' });
    setHand(run, '3c@blackhole');
    const hole = run.night!.hand[0]!;
    run.deck.push({ ...hole });
    const events = placeCard(run, 0, 11);
    const score = ignite(events);
    if (score?.t !== 'ignite') throw new Error('ждали вспышку');
    expect(score.score.lines[0]!.steps).toContainEqual(expect.objectContaining({ source: { kind: 'body', body: 'blackhole', cell: 11, cardId: hole.id }, xMult: BLACKHOLE_XMULT }));
    expect(events).toContainEqual({ t: 'cardDestroyed', cardId: hole.id, cell: 11, reason: 'consumed' });
    expect(run.deck.some((c) => c.id === hole.id)).toBe(false);
  });

  it('на тело глиф не наносится', () => {
    const run = nightRun();
    run.night = null;
    run.phase = 'shop';
    const body = { id: 999, suit: 'sun' as const, rank: 5, body: 'polaris' as const };
    run.deck.push(body);
    expect(() => applyRitual(run, 'glyph-blazing', [body.id])).toThrow();
  });
});
