import { describe, expect, it } from 'vitest';
import { BOSS_LIST } from '../src/core/content/bosses';
import { OMEN_LIST } from '../src/core/content/omens';
import { RITUAL_LIST } from '../src/core/content/rituals';
import { SKY_LIST } from '../src/core/content/skies';
import { COMBO_IDS, GLYPHS } from '../src/core/types';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('локализация', () => {
  it('английский словарь повторяет русский', () => {
    expect(keys(en).sort()).toEqual(keys(ru).sort());
  });

  it.each([
    ['omen', OMEN_LIST],
    ['boss', BOSS_LIST],
    ['ritual', RITUAL_LIST],
    ['sky', SKY_LIST],
  ] as const)('у каждого %s есть название и описание на обоих языках', (table, list) => {
    for (const item of list) {
      for (const dict of [ru, en]) {
        const pair = (dict[table] as Record<string, [string, string]>)[item.id];
        expect(pair, `${table}.${item.id}`).toBeDefined();
        expect(pair![0].length).toBeGreaterThan(0);
      }
    }
  });

  it('созвездия и глифы названы', () => {
    for (const dict of [ru, en]) {
      for (const id of COMBO_IDS) expect(dict.combo[id]).toBeTruthy();
      for (const g of GLYPHS) expect(dict.glyph[g]).toBeTruthy();
    }
  });
});
