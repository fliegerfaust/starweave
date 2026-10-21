import { describe, expect, it } from 'vitest';
import { dbBytes, insertBatch, openDb } from '../server/src/db.ts';
import { admit, clientKey, DailyQuota, eventLimits, RateLimiter } from '../server/src/limits.ts';

describe('сервер: защита от заливки (SEC.1)', () => {
  it('IPv6 считается по подсети /64, IPv4 — по адресу', () => {
    expect(clientKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:db8::5')).toBe('2001:db8:0:0::/64');
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('[2001:db8:1:2::9]')).toBe('2001:db8:1:2::/64');
  });

  it('перебор адресов внутри /64 не даёт новых вёдер', () => {
    const limits = eventLimits();
    let passed = 0;
    for (let i = 0; i < 200; i++) if (admit(limits, `2001:db8:1:2::${i.toString(16)}`, 1000) === 'ok') passed++;
    expect(passed).toBe(30);
  });

  it('общий потолок держит поток с тысяч разных адресов', () => {
    const limits = eventLimits();
    let passed = 0;
    for (let i = 0; i < 5000; i++) if (admit(limits, `198.51.${i >> 8}.${i & 255}`, 1000) === 'ok') passed++;
    expect(passed).toBe(200);
    // Через секунду — ещё 20
    let later = 0;
    for (let i = 0; i < 100; i++) if (admit(limits, `192.0.2.${i}`, 2000) === 'ok') later++;
    expect(later).toBe(20);
  });

  it('таблица вёдер не растёт выше предела, старые вёдра забываются', () => {
    const rl = new RateLimiter(1, 5, 100, 60_000);
    for (let i = 0; i < 1000; i++) rl.allow(`k${i}`, 0);
    expect(rl.size).toBe(100);
    expect(rl.allow('new', 1000)).toBe(false);
    expect(rl.allow('new', 120_000)).toBe(true);
    expect(rl.size).toBe(1);
  });

  it('дневная квота на игрока сбрасывается в новые сутки', () => {
    const q = new DailyQuota(3);
    expect([1, 2, 3, 4].map(() => q.take('c1', 10))).toEqual([true, true, true, false]);
    expect(q.take('c2', 10)).toBe(true);
    expect(q.take('c1', 86_400_000 + 10)).toBe(true);
  });

  it('размер базы считается по страницам и растёт с записью', () => {
    const db = openDb(':memory:');
    const before = dbBytes(db);
    const params = { text: 'x'.repeat(200) };
    for (let i = 0; i < 50; i++) {
      insertBatch(db, { client: 'c', session: 's', platform: 'web', version: '1', lang: 'ru', events: Array.from({ length: 50 }, () => ({ name: 'e', at: i, params })) });
    }
    expect(dbBytes(db)).toBeGreaterThan(before + 500_000);
  });
});

describe('сервер: бэкапы (SEC.2)', () => {
  it('копия покупок читается отдельно, старые копии удаляются', async () => {
    const { mkdtempSync, readdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { DatabaseSync } = await import('node:sqlite');
    const { runBackups, KEEP_DAYS } = await import('../server/src/backup.ts');
    const dir = mkdtempSync(join(tmpdir(), 'sw-backup-'));
    const db = openDb(':memory:');
    db.prepare('INSERT INTO purchases VALUES (?, ?, ?, ?, ?, ?)').run('ch1', 42, 'atlas', 250, 1, 0);
    writeFileSync(join(dir, 'purchases-2000-01-01.db'), '');
    const sunday = Date.UTC(2026, 9, 25);
    expect(runBackups(db, dir, sunday)).toContain('покупок: 1');
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['events-weekly.db', 'purchases-2026-10-25.db']);
    const copy = new DatabaseSync(join(dir, 'purchases-2026-10-25.db'));
    expect(copy.prepare('SELECT user_id, product FROM purchases').all()).toEqual([{ user_id: 42, product: 'atlas' }]);
    copy.close();
    expect(KEEP_DAYS).toBe(30);
  });
});
