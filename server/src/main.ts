import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { insertBatch, openDb, purgeOld } from './db.ts';
import { renderDashboard } from './dashboard.ts';
import { computeStats } from './stats.ts';
import { LIMITS, parseBatch } from './validate.ts';

/**
 * Сервер игры «Звёздное плетение»: принимает анонимные события от игры и показывает
 * сводку. Снаружи стоит Caddy (HTTPS); сюда приходит только он, поэтому адрес клиента
 * берётся из X-Forwarded-For — и используется лишь для ограничения частоты, не хранится.
 *
 *   POST /v1/events  — пачка событий (text/plain с JSON, чтобы браузер обходился без preflight)
 *   GET  /stats      — сводка, вход по паролю (Basic)
 *   GET  /health     — для проверки контейнера
 */

const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const DB_PATH = env.DB_PATH ?? '/data/events.db';
const STATS_USER = env.STATS_USER ?? 'denis';
const STATS_PASSWORD = env.STATS_PASSWORD ?? '';
const ORIGINS = new Set((env.ALLOWED_ORIGINS ?? 'https://fliegerfaust.github.io').split(',').map((s) => s.trim()).filter(Boolean));

if (STATS_PASSWORD.length < 12) {
  console.error('STATS_PASSWORD не задан или короче 12 символов — сводка была бы открыта всем. Останавливаюсь.');
  process.exit(1);
}

const db = openDb(DB_PATH);

// ── Ограничение частоты: ведро на адрес, 60 пачек в минуту с запасом 30 ──────────
const buckets = new Map<string, { tokens: number; at: number }>();
const RATE = 1; // пачек в секунду
const BURST = 30;

function allow(ip: string, now: number): boolean {
  const b = buckets.get(ip) ?? { tokens: BURST, at: now };
  b.tokens = Math.min(BURST, b.tokens + ((now - b.at) / 1000) * RATE);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}
setInterval(() => {
  const old = Date.now() - 10 * 60 * 1000;
  for (const [ip, b] of buckets) if (b.at < old) buckets.delete(ip);
}, 60 * 1000).unref();

// ── Чистка старых событий раз в сутки ─────────────────────────────────────────
const purge = () => {
  try {
    const n = purgeOld(db, Date.now());
    if (n) console.log(`удалено старых событий: ${n}`);
  } catch (err) {
    console.error('чистка не удалась', err);
  }
};
purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function send(res: ServerResponse, status: number, body = '', headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  const pass = rest.join(':');
  const expected = Buffer.from(`${STATS_USER}:${STATS_PASSWORD}`);
  const given = Buffer.from(`${user}:${pass}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handleEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers.origin ?? '';
  const cors: Record<string, string> = ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') {
    send(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
    return;
  }
  if (req.method !== 'POST') return send(res, 405, 'method');
  // Браузер всегда шлёт Origin с POST: события принимаем только от нашей игры
  if (!ORIGINS.has(origin)) return send(res, 403, 'origin');
  if (!allow(clientIp(req), Date.now())) return send(res, 429, 'slow down', cors);
  const raw = await readBody(req, LIMITS.body);
  if (raw === null) return send(res, 413, 'too large', cors);
  const batch = parseBatch(raw, Date.now());
  if (typeof batch === 'string') return send(res, 400, batch, cors);
  try {
    insertBatch(db, batch);
  } catch (err) {
    console.error('запись не удалась', err);
    return send(res, 500, 'store', cors);
  }
  send(res, 204, '', cors);
}

function handleStats(req: IncomingMessage, res: ServerResponse, url: URL): void {
  if (!authorized(req)) {
    send(res, 401, 'Нужен пароль', { 'WWW-Authenticate': 'Basic realm="Starweave", charset="UTF-8"' });
    return;
  }
  const days = [1, 7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7;
  const html = renderDashboard(computeStats(db, Date.now(), days));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Robots-Tag': 'noindex',
  });
  res.end(html);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/v1/events') return void handleEvents(req, res);
    if (url.pathname === '/stats') return handleStats(req, res, url);
    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname === '/') return send(res, 200, 'Звёздное плетение — сервер игры');
    send(res, 404, 'not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'error');
  }
});

server.listen(PORT, () => console.log(`слушаю :${PORT}, база ${DB_PATH}, источники: ${[...ORIGINS].join(', ')}`));

const stop = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
