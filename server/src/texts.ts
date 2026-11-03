import { createHash } from 'node:crypto';
import { checkText, defaultText, TEXT_LANGS, textCatalog, type TextLang, type TextProblem } from '../../src/i18n/texts.ts';
import type { Db } from './db.ts';

/**
 * Тексты обучения на сервере (эпик TX). В базе лежат только правки поверх текстов сборки:
 * нет строки — игра показывает свой текст. Каждая правка пишется в историю, из неё же
 * видно, какой английский устарел: русский правили позже, чем переводили.
 */

export function openTexts(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS texts (
      key        TEXT NOT NULL,
      lang       TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      author     TEXT NOT NULL,
      PRIMARY KEY (key, lang)
    );
    -- История правок: value NULL — вернули текст по умолчанию
    CREATE TABLE IF NOT EXISTS texts_log (
      id     INTEGER PRIMARY KEY,
      key    TEXT NOT NULL,
      lang   TEXT NOT NULL,
      value  TEXT,
      at     INTEGER NOT NULL,
      author TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS texts_log_key ON texts_log (key, lang, at);
  `);
}

export const isTextLang = (s: unknown): s is TextLang => TEXT_LANGS.includes(s as TextLang);

/** Действующие правки языка — только по ключам, которые ещё есть в игре. */
export function overrides(db: Db, lang: TextLang): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM texts WHERE lang = ? ORDER BY key').all(lang) as { key: string; value: string }[];
  return Object.fromEntries(rows.filter((r) => defaultText(lang, r.key) !== undefined).map((r) => [r.key, r.value]));
}

/** Набор для игры: правки обоих языков и версия (хэш содержимого) для ETag. */
export function textsPayload(db: Db): { v: string; body: string } {
  const texts = Object.fromEntries(TEXT_LANGS.map((lang) => [lang, overrides(db, lang)]));
  const v = createHash('sha256').update(JSON.stringify(texts)).digest('base64url').slice(0, 16);
  return { v, body: JSON.stringify({ v, texts }) };
}

export type SaveResult = { ok: true } | { ok: false; problem: TextProblem | 'key' };

/** Правка одного текста; `null` — вернуть текст по умолчанию. Проверки те же, что в игре. */
export function saveText(db: Db, lang: TextLang, key: string, value: string | null, author: string, now: number): SaveResult {
  const def = defaultText(lang, key);
  if (def === undefined) return { ok: false, problem: 'key' };
  // Переносы строк и пробелы по краям из поля ввода в пузыре не нужны
  const clean = value === null ? null : value.replace(/\s+/g, ' ').trim();
  if (clean !== null) {
    const problem = checkText(def, clean);
    if (problem) return { ok: false, problem };
  }
  const current = (db.prepare('SELECT value FROM texts WHERE key = ? AND lang = ?').get(key, lang) as { value: string } | undefined)?.value ?? null;
  // Совпадает с текстом по умолчанию — это возврат к нему
  const next = clean === def ? null : clean;
  if (next === current) return { ok: true };
  db.exec('BEGIN');
  try {
    if (next === null) db.prepare('DELETE FROM texts WHERE key = ? AND lang = ?').run(key, lang);
    else db.prepare('INSERT INTO texts (key, lang, value, updated_at, author) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key, lang) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, author = excluded.author').run(key, lang, next, now, author);
    db.prepare('INSERT INTO texts_log (key, lang, value, at, author) VALUES (?, ?, ?, ?, ?)').run(key, lang, next, now, author);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
}

export interface LogEntry {
  id: number;
  value: string | null;
  at: number;
  author: string;
}

/** Последние правки ключа, новые сверху. */
export function history(db: Db, lang: TextLang, key: string, limit = 8): LogEntry[] {
  return db.prepare('SELECT id, value, at, author FROM texts_log WHERE key = ? AND lang = ? ORDER BY at DESC, id DESC LIMIT ?').all(key, lang, limit) as unknown as LogEntry[];
}

export function logEntry(db: Db, id: number): (LogEntry & { key: string; lang: string }) | undefined {
  return db.prepare('SELECT id, key, lang, value, at, author FROM texts_log WHERE id = ?').get(id) as (LogEntry & { key: string; lang: string }) | undefined;
}

/**
 * Ключи, где нужен перевод: русский правили позже английского (или английского не трогали
 * вовсе). Перевод снимает пометку, даже если английский остался прежним.
 */
export function needsTranslation(db: Db): string[] {
  const rows = db.prepare(`
    SELECT r.key FROM (SELECT key, MAX(at) AS at FROM texts_log WHERE lang = 'ru' GROUP BY key) r
    LEFT JOIN (SELECT key, MAX(at) AS at FROM texts_log WHERE lang = 'en' GROUP BY key) e ON e.key = r.key
    WHERE e.at IS NULL OR e.at < r.at
  `).all() as { key: string }[];
  const order = new Map(textCatalog('ru').map((e, i) => [e.key, i]));
  return rows.map((r) => r.key).filter((k) => order.has(k)).sort((a, b) => order.get(a)! - order.get(b)!);
}

/** Пометить перевод сделанным без правки: английский по-прежнему верен. */
export function markTranslated(db: Db, key: string, author: string, now: number): void {
  const value = (db.prepare("SELECT value FROM texts WHERE key = ? AND lang = 'en'").get(key) as { value: string } | undefined)?.value ?? null;
  db.prepare("INSERT INTO texts_log (key, lang, value, at, author) VALUES (?, 'en', ?, ?, ?)").run(key, value, now, author);
}
