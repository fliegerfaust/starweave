import { describe, expect, it } from 'vitest';
import { CHUNK, chunkKeys, cloudKey, INDEX_KEY, pack, unpack } from '../src/platform/telegram-cloud';

describe('сохранения в CloudStorage Telegram', () => {
  it('ключи только из допустимых символов', () => {
    expect(cloudKey('starweave.run.v1')).toBe('starweave_run_v1');
    expect(cloudKey('starweave.run.v1')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('длинное значение режется на куски и собирается обратно', () => {
    const run = 'x'.repeat(CHUNK * 2 + 123);
    const data = { 'starweave.run.v1': run, 'starweave.settings.v1': '{"lang":"ru"}' };
    const { items, index } = pack(data);
    expect(index['starweave.run.v1']).toBe(3);
    for (const value of Object.values(items)) expect(value.length).toBeLessThanOrEqual(CHUNK);
    expect(JSON.parse(items[INDEX_KEY]!)).toEqual(index);
    const read = Object.fromEntries(chunkKeys(index).map((k) => [k, items[k]!]));
    expect(unpack(index, read)).toEqual(data);
  });

  it('оборванная запись не отдаёт битых данных', () => {
    const { items, index } = pack({ a: 'y'.repeat(CHUNK + 1), b: 'ok' });
    delete items['a_1'];
    expect(unpack(index, items)).toEqual({ b: 'ok' });
  });
});
