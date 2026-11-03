import { describe, expect, it } from 'vitest';
import { ru } from '../src/i18n/ru.ts';
import { openDb } from '../server/src/db.ts';
import { renderTextsPage, sameOrigin } from '../server/src/texts-page.ts';
import { history, logEntry, markTranslated, needsTranslation, openTexts, overrides, saveText, textsPayload } from '../server/src/texts.ts';

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

function fresh() {
  const db = openDb(':memory:');
  openTexts(db);
  return db;
}

describe('сервер: тексты обучения (TX.2, TX.3)', () => {
  it('пустой набор — игра берёт свои тексты', () => {
    const db = fresh();
    const { v, body } = textsPayload(db);
    expect(JSON.parse(body)).toEqual({ v, texts: { ru: {}, en: {} } });
  });

  it('правка сохраняется, версия меняется, история пишется', () => {
    const db = fresh();
    const v0 = textsPayload(db).v;
    expect(saveText(db, 'ru', 'tut.place1', '  *Потяни 3 Солнца*\n в клетку. ', 'denis', NOW)).toEqual({ ok: true });
    expect(overrides(db, 'ru')).toEqual({ 'tut.place1': '*Потяни 3 Солнца* в клетку.' });
    expect(textsPayload(db).v).not.toBe(v0);
    expect(history(db, 'ru', 'tut.place1')).toMatchObject([{ value: '*Потяни 3 Солнца* в клетку.', author: 'denis' }]);
  });

  it('проверки те же, что в игре; чужие ключи не принимаются', () => {
    const db = fresh();
    expect(saveText(db, 'ru', 'tut.shortRow', 'Без числа', 'denis', NOW)).toEqual({ ok: false, problem: 'vars' });
    expect(saveText(db, 'ru', 'tut.place1', 'Длинное — тире', 'denis', NOW)).toEqual({ ok: false, problem: 'dash' });
    expect(saveText(db, 'ru', 'night.begin', 'Вперёд', 'denis', NOW)).toEqual({ ok: false, problem: 'key' });
    expect(overrides(db, 'ru')).toEqual({});
  });

  it('текст по умолчанию и сброс убирают правку, откат берёт из истории', () => {
    const db = fresh();
    saveText(db, 'ru', 'tut.giftCaption', 'Дальше', 'denis', NOW);
    saveText(db, 'ru', 'tut.giftCaption', ru.tut.giftCaption, 'denis', NOW + 1);
    expect(overrides(db, 'ru')).toEqual({});
    saveText(db, 'ru', 'tut.giftCaption', 'Вперёд', 'denis', NOW + 2);
    saveText(db, 'ru', 'tut.giftCaption', null, 'denis', NOW + 3);
    expect(overrides(db, 'ru')).toEqual({});
    const old = history(db, 'ru', 'tut.giftCaption').find((l) => l.value === 'Вперёд')!;
    saveText(db, 'ru', 'tut.giftCaption', logEntry(db, old.id)!.value, 'denis', NOW + 4);
    expect(overrides(db, 'ru')).toEqual({ 'tut.giftCaption': 'Вперёд' });
  });

  it('правка русского помечает английский к переводу, перевод снимает пометку', () => {
    const db = fresh();
    saveText(db, 'ru', 'tut.giftCaption', 'Дальше', 'denis', NOW);
    saveText(db, 'ru', 'tut.doneTitle', 'Обучение позади', 'denis', NOW);
    expect(needsTranslation(db)).toEqual(['tut.doneTitle', 'tut.giftCaption']);
    saveText(db, 'en', 'tut.giftCaption', 'Onward', 'claude', NOW + 1);
    // Английский остался верным — пометку снимают без правки
    markTranslated(db, 'tut.doneTitle', 'claude', NOW + 1);
    expect(needsTranslation(db)).toEqual([]);
    saveText(db, 'ru', 'tut.giftCaption', 'Вперёд', 'denis', NOW + 2);
    expect(needsTranslation(db)).toEqual(['tut.giftCaption']);
  });

  it('редактор: тексты по шагам, предпросмотр как в игре, ввод экранирован', () => {
    const db = fresh();
    saveText(db, 'ru', 'tut.shortRow', 'Звездочёт, до рассвета *{n} очков*. *Перетащи карту* в клетку.', 'denis', NOW);
    const html = renderTextsPage(db, { lang: 'ru', saved: 'tut.shortRow' });
    expect(html).toContain('Обучение: первая ночь и Обсерватория');
    expect(html).toContain('<b>Перетащи карту</b>');
    expect(html).toContain('<i>150</i>');
    expect(html).toContain('Сохранено');
    expect(html.indexOf('id="tut.board"')).toBeLessThan(html.indexOf('id="tut.place1"'));
    const bad = renderTextsPage(db, { lang: 'ru', error: { key: 'tut.place1', value: '<img src=x>', problem: 'markup' } });
    expect(bad).not.toContain('<img src=x>');
    expect(bad).toContain('Знаки &lt; и &gt; не нужны');
  });

  it('английская страница показывает русский оригинал и что переводить', () => {
    const db = fresh();
    saveText(db, 'ru', 'tut.giftCaption', 'Дальше', 'denis', NOW);
    const html = renderTextsPage(db, { lang: 'en' });
    expect(html).toContain('English · 1 к переводу');
    expect(html).toContain('Нужен перевод');
    expect(html).toContain('Перевод верен');
  });

  it('запись принимается только со своей страницы, в том числе за no-referrer Caddy', () => {
    const host = 'game.denvalclass.ru';
    expect(sameOrigin({ host, origin: `https://${host}`, 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(sameOrigin({ host, origin: `https://${host}` })).toBe(true);
    // no-referrer: браузер шлёт Origin: null, своё подтверждает Sec-Fetch-Site
    expect(sameOrigin({ host, origin: 'null', 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(sameOrigin({ host, origin: 'null' })).toBe(false);
    expect(sameOrigin({ host, origin: 'null', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(sameOrigin({ host, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(sameOrigin({ host, origin: 'https://evil.example' })).toBe(false);
    expect(sameOrigin({ host })).toBe(false);
    expect(renderTextsPage(fresh(), { lang: 'ru' })).toContain('<meta name="referrer" content="same-origin">');
  });
});
