import { DatabaseSync } from 'node:sqlite';
import type { Batch } from './validate.ts';

/**
 * Хранилище событий — один файл SQLite. Для потока событий игры этого с запасом:
 * тысячи игроков — это десятки мегабайт в год. Режим WAL: запись не мешает чтению
 * сводки. События старше `RETENTION_DAYS` удаляются — сырые данные дольше не нужны.
 */
export const RETENTION_DAYS = 400;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS events (
      id       INTEGER PRIMARY KEY,
      ts       INTEGER NOT NULL,
      client   TEXT NOT NULL,
      session  TEXT NOT NULL,
      platform TEXT NOT NULL,
      version  TEXT NOT NULL,
      lang     TEXT NOT NULL,
      name     TEXT NOT NULL,
      params   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_name_ts ON events (name, ts);
    CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
    CREATE INDEX IF NOT EXISTS events_client_ts ON events (client, ts);
  `);
  return db;
}

/** Записывает пачку одной транзакцией: либо вся, либо ничего. */
export function insertBatch(db: Db, batch: Batch): void {
  const stmt = db.prepare('INSERT INTO events (ts, client, session, platform, version, lang, name, params) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const e of batch.events) {
      stmt.run(Math.round(e.at), batch.client, batch.session, batch.platform, batch.version, batch.lang, e.name, JSON.stringify(e.params));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Удаляет события старше срока хранения. Возвращает число удалённых. */
export function purgeOld(db: Db, now: number): number {
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const result = db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff);
  return Number(result.changes);
}
