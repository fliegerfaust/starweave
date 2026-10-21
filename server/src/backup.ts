import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';

/**
 * Бэкапы (SEC.2). Покупки — это деньги игроков: каждые сутки они копируются в маленький
 * файл `purchases-ГГГГ-ММ-ДД.db` (хранятся 30 дней). Раз в неделю — полная копия базы
 * `events-weekly.db` (одна, перезаписывается): события — аналитика, их потеря не страшна.
 * Копии лежат в `/data/backups` на сервере; вне сервера их забирает
 * `server/scripts/pull-backup.sh` с машины Дениса.
 */
export const KEEP_DAYS = 30;

const day = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Копирует таблицу покупок в отдельный файл. Возвращает путь и число строк. */
export function backupPurchases(db: Db, dir: string, now: number): { file: string; rows: number } {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `purchases-${day(now)}.db`);
  rmSync(file, { force: true });
  const out = new DatabaseSync(file);
  try {
    out.exec(`CREATE TABLE purchases (
      charge_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, product TEXT NOT NULL,
      stars INTEGER NOT NULL, ts INTEGER NOT NULL, refunded INTEGER NOT NULL DEFAULT 0)`);
    const rows = db.prepare('SELECT charge_id, user_id, product, stars, ts, refunded FROM purchases').all() as Record<string, string | number>[];
    const ins = out.prepare('INSERT INTO purchases VALUES (?, ?, ?, ?, ?, ?)');
    out.exec('BEGIN');
    for (const r of rows) ins.run(r.charge_id!, r.user_id!, r.product!, r.stars!, r.ts!, r.refunded!);
    out.exec('COMMIT');
    return { file, rows: rows.length };
  } finally {
    out.close();
  }
}

/** Полная копия базы одним файлом (`VACUUM INTO` — согласованный снимок без остановки). */
export function backupFull(db: Db, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'events-weekly.db');
  rmSync(file, { force: true });
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

/** Удаляет дневные копии покупок старше `KEEP_DAYS`. */
export function pruneBackups(dir: string, now: number): number {
  const cutoff = day(now - KEEP_DAYS * 86_400_000);
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const m = /^purchases-(\d{4}-\d{2}-\d{2})\.db$/.exec(name);
    if (m && m[1]! < cutoff) {
      rmSync(join(dir, name), { force: true });
      removed++;
    }
  }
  return removed;
}

/** Ежесуточный проход: копия покупок, по воскресеньям — полная копия, чистка старого. */
export function runBackups(db: Db, dir: string, now: number): string {
  const { rows } = backupPurchases(db, dir, now);
  let note = `покупок: ${rows}`;
  if (new Date(now).getUTCDay() === 0) {
    backupFull(db, dir);
    note += ', полная копия';
  }
  const pruned = pruneBackups(dir, now);
  if (pruned) note += `, удалено старых: ${pruned}`;
  return note;
}
