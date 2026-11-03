import { afterEach, describe, expect, it, vi } from 'vitest';
import { dict, setLang, t, useTexts } from '@/i18n';
import { checkText, defaultText, textCatalog, TEXT_LANGS, textVars, withTexts } from '@/i18n/texts';
import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';

describe('тексты обучения: каталог и проверки (TX.1)', () => {
  it('каталог одинаков в обоих языках, и тексты сборки проходят свои проверки', () => {
    const keys = (lang: 'ru' | 'en') => textCatalog(lang).map((e) => e.key);
    expect(keys('en')).toEqual(keys('ru'));
    for (const lang of TEXT_LANGS) {
      for (const e of textCatalog(lang)) expect([e.key, checkText(e.value, e.value)]).toEqual([e.key, null]);
    }
    // Подстановки в переводе те же, что в русском
    for (const e of textCatalog('ru')) expect([e.key, textVars(defaultText('en', e.key)!)]).toEqual([e.key, textVars(e.value)]);
  });

  it('в каталоге реплики обучения, подсказки, наставник, путь и список «Обучение пройдено»', () => {
    const keys = textCatalog('ru').map((e) => e.key);
    for (const k of ['tut.place1', 'tut.shortRow', 'tut.learned.0', 'tut.learned.4', 'tutorial.shopBuy', 'mentor.name', 'runPath.say']) expect(keys).toContain(k);
    expect(keys).not.toContain('night.begin');
  });

  it('ловит сломанные правки', () => {
    const def = 'Звездочёт, зажжём небо: *{n} очков*.';
    expect(checkText(def, '')).toBe('empty');
    expect(checkText(def, 'Зажги *{total} очков*.')).toBe('vars');
    expect(checkText(def, 'Зажги небо: *{n} очков.')).toBe('stars');
    expect(checkText(def, 'Небо — *{n} очков*.')).toBe('dash');
    expect(checkText(def, 'Небо <b>*{n}*</b>')).toBe('markup');
    expect(checkText(def, `*{n}* ${'а'.repeat(200)}`)).toBe('long');
    expect(checkText(def, 'Звездочёт, до рассвета *{n} очков*.')).toBeNull();
  });

  it('правки ложатся поверх словаря, не меняя тексты сборки', () => {
    const before = ru.tut.place1;
    const { dict: d, applied } = withTexts(ru, 'ru', {
      'tut.place1': '*Потяни 3 Солнца* в клетку.',
      'tut.learned.1': 'Ряд',
      'tut.place2': 'сломано *',
      'night.begin': 'чужой ключ',
      'mentor.name': 42,
    });
    expect(applied).toEqual(['tut.place1', 'tut.learned.1']);
    expect(d.tut.place1).toBe('*Потяни 3 Солнца* в клетку.');
    expect(d.tut.learned).toEqual(['Карта', 'Ряд', 'Крест', 'Сжечь', 'Знамения']);
    expect(d.tut.place2).toBe(ru.tut.place2);
    expect(d.night).toBe(ru.night);
    expect(ru.tut.place1).toBe(before);
    expect(ru.tut.learned[1]).toBe('Линия');
  });
});

describe('тексты обучения в игре (TX.4)', () => {
  afterEach(() => {
    useTexts('ru', {});
    useTexts('en', {});
    setLang('ru');
  });

  it('t() и dict() видят правки, пустой набор возвращает свои', () => {
    setLang('ru');
    useTexts('ru', { 'tut.shortRow': 'Звездочёт, до рассвета *{n} очков*: *перетащи карту* в клетку.', 'tut.learned.0': 'Карты' });
    expect(t('tut.shortRow', { n: 150 })).toBe('Звездочёт, до рассвета *150 очков*: *перетащи карту* в клетку.');
    expect(dict().tut.learned[0]).toBe('Карты');
    setLang('en');
    expect(t('tut.shortRow', { n: 150 })).toBe(en.tut.shortRow.replace('{n}', '150'));
    setLang('ru');
    useTexts('ru', {});
    expect(t('tut.shortRow')).toBe(ru.tut.shortRow);
  });
});

describe('загрузка текстов с сервера (TX.4)', () => {
  const store = new Map<string, string>();
  const stubStorage = () =>
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  const stubWindow = () => vi.stubGlobal('window', { setTimeout, clearTimeout });

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
    useTexts('ru', {});
    useTexts('en', {});
    setLang('ru');
  });

  it('битый ответ не принимается, лишнее отбрасывается', async () => {
    const { parseTexts } = await import('@/meta/texts-sync');
    expect(parseTexts(null)).toBeNull();
    expect(parseTexts({ v: 1, texts: {} })).toBeNull();
    expect(parseTexts({ v: 'a', texts: [] })).toBeNull();
    expect(parseTexts({ v: 'a', texts: { ru: { 'tut.giftCaption': 'Дальше', bad: 5 }, de: { x: 'y' } } })).toEqual({ v: 'a', texts: { ru: { 'tut.giftCaption': 'Дальше' } } });
  });

  it('ответил вовремя — тексты сразу и на устройство', async () => {
    stubStorage();
    stubWindow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ v: 'v1', texts: { ru: { 'tut.giftCaption': 'Дальше' } } }))));
    const { loadTexts, TEXTS_KEY } = await import('@/meta/texts-sync');
    await loadTexts('https://srv', 1500);
    expect(t('tut.giftCaption')).toBe('Дальше');
    expect(JSON.parse(store.get(TEXTS_KEY)!).v).toBe('v1');
  });

  it('не успел — свои тексты сейчас, ответ со следующего запуска', async () => {
    stubStorage();
    stubWindow();
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))));
    const { loadTexts, TEXTS_KEY } = await import('@/meta/texts-sync');
    await loadTexts('https://srv', 20);
    expect(t('tut.giftCaption')).toBe(ru.tut.giftCaption);
    answer(new Response(JSON.stringify({ v: 'v2', texts: { ru: { 'tut.giftCaption': 'Дальше' } } })));
    await vi.waitFor(() => expect(store.has(TEXTS_KEY)).toBe(true));
    expect(t('tut.giftCaption')).toBe(ru.tut.giftCaption);
    // Следующий запуск без сети: тексты с прошлого раза
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await loadTexts('https://srv', 20);
    expect(t('tut.giftCaption')).toBe('Дальше');
  });

  it('без сервера и с ошибкой сервера — тексты сборки', async () => {
    stubStorage();
    stubWindow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })));
    const { loadTexts } = await import('@/meta/texts-sync');
    await loadTexts(null);
    await loadTexts('https://srv', 50);
    expect(t('tut.giftCaption')).toBe(ru.tut.giftCaption);
  });

  it('недостающие или лишние подстановки в ответе — ключ остаётся своим', async () => {
    stubStorage();
    stubWindow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ v: 'v3', texts: { ru: { 'tut.shortRow': 'Без числа', 'runPath.say': 'До рассвета *{total} глав* и {n}' } } }))));
    const { loadTexts } = await import('@/meta/texts-sync');
    await loadTexts('https://srv', 500);
    expect(t('tut.shortRow')).toBe(ru.tut.shortRow);
    expect(t('runPath.say')).toBe(ru.runPath.say);
  });
});

describe('перенос правок в словари к релизу (TX.5)', () => {
  it('каждый правимый текст находится и меняется только он', async () => {
    const { readFileSync } = await import('node:fs');
    const { foldText, literal } = await import('../scripts/texts-fold.ts');
    for (const lang of TEXT_LANGS) {
      const src = readFileSync(`src/i18n/${lang}.ts`, 'utf8');
      for (const { key } of textCatalog(lang)) {
        const value = `Правка ${key}: *дело* «кавычки» it's ok`;
        const next = foldText(src, key, value);
        expect([lang, key, next === null]).toEqual([lang, key, false]);
        const lit = literal(value);
        expect(next!.split(lit).length - 1).toBe(1);
        // Остальной файл не тронут: заменён ровно один строковый литерал
        const at = next!.indexOf(lit);
        const before = next!.slice(0, at);
        const after = next!.slice(at + lit.length);
        expect(src.startsWith(before) && src.endsWith(after)).toBe(true);
        expect(src.slice(before.length, src.length - after.length)).toMatch(/^(['"]).*\1$/s);
      }
    }
  });
});
