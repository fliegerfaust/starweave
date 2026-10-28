import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { AUTO, hasKeyword, keywordKeys, MARK } from '../src/ui/keyword-registry';

/**
 * Сторож реестра ключевых слов (KW.4, правило Дениса 28.10 после отзыва Андрея): термин механики в
 * тексте эффекта без подсказки — ошибка. Новый термин добавляется сразу в keyword-registry.ts и
 * `kw.rule` на обоих языках, иначе этот тест падает.
 */
type Dict = Record<string, unknown>;
const DICTS = { ru: ru as unknown as Dict, en: en as unknown as Dict };

/** Разделы с текстами эффектов: они показываются с подсказками (rich, bonusLine, kwText). */
const EFFECT_SECTIONS = ['omen', 'boss', 'trophy', 'ritual', 'glyphDesc', 'bodyDesc', 'bodyShort', 'pack'];

/** Словарь механики: слово в тексте эффекта → ключ подсказки, который обязан на нём стоять. */
const VOCABULARY: { ru: RegExp; en: RegExp; key: string }[] = [
  { ru: /(?<![а-яё])миф(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![а-яё])/i, en: /\bmyths?\b/i, key: 'myth' },
  { ru: /процент(?:ы|ов|ам|ами|ах)/i, en: /\binterest\b/i, key: 'interest' },
  { ru: /небесн\S* тел/i, en: /celestial bod/i, key: 'body' },
  { ru: /сжигани/i, en: /\bburns?\b/i, key: 'burn' },
  { ru: /(?<!Северный )(?<![а-яё])крест(?:а|у|ом|е|ы|ов|ам)?(?![а-яё])/i, en: /(?<!Northern )\bcross(?:es)?\b/i, key: 'cross' },
  { ru: /затмени/i, en: /\beclipses?\b/i, key: 'eclipse' },
  { ru: /(?<![а-яё])уров(?:ень|ня|ню|нем|не|ни|ней)(?![а-яё])/i, en: /\blevels?\b/i, key: 'level' },
  { ru: /(?<![а-яё])ранг(?:а|у|ом|и|ов|ам)?(?![а-яё])/i, en: /\branks?\b/i, key: 'rank' },
  { ru: /разби/i, en: /\bshatter/i, key: 'shatter' },
];

function texts(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(texts);
  if (v && typeof v === 'object') return Object.values(v).flatMap(texts);
  return [];
}

/** Описание эффекта: у пары [название, описание] — только описание (название рядом не выделяется). */
function effectTexts(d: Dict, section: string): string[] {
  return Object.values((d[section] ?? {}) as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? texts(v.slice(1)) : texts(v)));
}

describe('реестр ключевых слов (KW.4)', () => {
  for (const [lang, d] of Object.entries(DICTS)) {
    it(`${lang}: каждый термин механики в текстах эффектов получает подсказку`, () => {
      const missing: string[] = [];
      for (const section of EFFECT_SECTIONS) {
        for (const text of effectTexts(d, section)) {
          const keys = keywordKeys(text);
          for (const v of VOCABULARY) {
            if (v[lang as 'ru' | 'en'].test(text) && !keys.includes(v.key)) missing.push(`${section}: «${text}» — нет «${v.key}»`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it(`${lang}: у каждого ключа в разметке и в автоподсветке есть подсказка`, () => {
      const broken: string[] = [];
      for (const text of texts(d)) {
        for (const m of text.matchAll(MARK)) if (!m[4] && !hasKeyword(m[2]!, d)) broken.push(`[${m[1]}|${m[2]}] в «${text}»`);
      }
      for (const a of AUTO) if (!hasKeyword(a.key, d)) broken.push(`автоподсветка ${a.key}`);
      for (const v of VOCABULARY) if (!hasKeyword(v.key, d)) broken.push(`словарь ${v.key}`);
      expect(broken).toEqual([]);
    });
  }

  it('правила-подсказки есть на обоих языках', () => {
    const rules = (d: Dict) => Object.keys((d.kw as { rule: object }).rule).sort();
    expect(rules(DICTS.en)).toEqual(rules(DICTS.ru));
  });

  it('имя мифа «Северный крест» не выдаётся за крест хода', () => {
    expect(keywordKeys('Северный крест из шести звёзд')).not.toContain('cross');
    expect(keywordKeys('The Northern Cross of six stars')).not.toContain('cross');
    expect(keywordKeys('Множитель цепи +1: крест даёт ×3')).toContain('cross');
    expect(keywordKeys('Each myth: +2 multiplier')).toContain('myth');
    expect(keywordKeys('Interest cap is 5 gold higher')).toContain('interest');
  });
});
