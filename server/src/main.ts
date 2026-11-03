import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { runBackups } from './backup.ts';
import { dbBytes, insertBatch, openDb, purgeOld } from './db.ts';
import { admit, DEFAULT_EVENTS_DB_MAX, eventLimits, RateLimiter, clientKey } from './limits.ts';
import { createInvoice, handleUpdate, ownedProducts, type PaymentsConfig } from './payments.ts';
import { botApi, verifyInitData } from './telegram.ts';
import { renderDashboard } from './dashboard.ts';
import { HallCache } from './hall.ts';
import { STACK_SCRIPT_HASH } from './stack-decoder.ts';
import { computeStats } from './stats.ts';
import { isTextLang, logEntry, markTranslated, needsTranslation, openTexts, overrides, saveText, textsPayload } from './texts.ts';
import { renderTextsPage, savedLocation, TEXTS_SCRIPT_HASH, type TextsPageOpts } from './texts-page.ts';
import { countReject, LIMITS, parseBatch, rejects } from './validate.ts';

/**
 * Сервер игры «Звёздное плетение»: принимает анонимные события от игры и показывает
 * сводку. Снаружи стоит Caddy (HTTPS); сюда приходит только он, поэтому адрес клиента
 * берётся из X-Forwarded-For — и используется лишь для ограничения частоты, не хранится.
 *
 *   POST /v1/events  — пачка событий (text/plain с JSON, чтобы браузер обходился без preflight)
 *   GET  /stats      — сводка, вход по паролю (Basic)
 *   GET  /v1/hall    — доли игроков для «Зала славы» (открыто всем, кэш на час)
 *   GET  /v1/texts   — правки текстов обучения для игры (открыто всем, ETag)
 *   GET|POST /stats/texts       — редактор текстов обучения (тот же пароль, что у сводки)
 *   GET|POST /stats/texts.json  — те же тексты для перевода скриптом (npm run texts:pull/push)
 *   GET  /health     — для проверки контейнера
 *   POST /v1/pay/invoice, /v1/pay/owned — покупки за Telegram Stars (игрок — по initData)
 *   POST /tg/webhook — обновления бота (оплаты, /start, /paysupport, /terms)
 */

const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const DB_PATH = env.DB_PATH ?? '/data/events.db';
const BACKUP_DIR = env.BACKUP_DIR ?? '/data/backups';
const STATS_USER = env.STATS_USER ?? 'denis';
const STATS_PASSWORD = env.STATS_PASSWORD ?? '';
// Свои устройства (Денис, проверки выпусков): в сводку не идут, события хранятся (SA.1)
const EXCLUDE_CLIENTS = (env.EXCLUDE_CLIENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ORIGINS = new Set((env.ALLOWED_ORIGINS ?? 'https://fliegerfaust.github.io').split(',').map((s) => s.trim()).filter(Boolean));

// Покупки включаются токеном бота; без него игра просто не показывает оплату
const BOT_TOKEN = env.BOT_TOKEN ?? '';
const WEBHOOK_SECRET = env.TG_WEBHOOK_SECRET ?? '';
const payCfg: PaymentsConfig | null = BOT_TOKEN
  ? {
      bot: botApi(BOT_TOKEN),
      adminChatId: Number(env.TG_ADMIN_CHAT_ID) || null,
      gameLink: env.GAME_LINK ?? 'https://t.me/starweave_game_bot/play',
      termsLink: env.TERMS_LINK ?? 'https://fliegerfaust.github.io/starweave/legal/terms.html',
    }
  : null;
if (BOT_TOKEN && WEBHOOK_SECRET.length < 16) {
  console.error('TG_WEBHOOK_SECRET не задан или короче 16 символов — кто угодно мог бы слать боту «оплаты». Останавливаюсь.');
  process.exit(1);
}

if (STATS_PASSWORD.length < 12) {
  console.error('STATS_PASSWORD не задан или короче 12 символов — сводка была бы открыта всем. Останавливаюсь.');
  process.exit(1);
}

const db = openDb(DB_PATH, EXCLUDE_CLIENTS);
openTexts(db);
const hall = new HallCache(db);

// ── Ограничение частоты и объёма (SEC.1, см. limits.ts) ──────────────────────
const limits = eventLimits();
// Покупки — свои вёдра: заливка событиями не мешает оплатить
const payLimiter = new RateLimiter(1, 30);
setInterval(() => {
  const now = Date.now();
  limits.perIp.sweep(now);
  payLimiter.sweep(now);
}, 60 * 1000).unref();

// Размер базы проверяем не на каждую пачку, а раз в 30 секунд
const EVENTS_DB_MAX = Number(env.EVENTS_DB_MAX_MB) > 0 ? Number(env.EVENTS_DB_MAX_MB) * 1024 * 1024 : DEFAULT_EVENTS_DB_MAX;
let dbFull = false;
const checkSize = () => {
  const bytes = dbBytes(db);
  if (bytes >= EVENTS_DB_MAX && !dbFull) console.error(`база ${Math.round(bytes / 1048576)} МБ — события больше не принимаются`);
  dbFull = bytes >= EVENTS_DB_MAX;
};
checkSize();
setInterval(checkSize, 30 * 1000).unref();

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

// ── Бэкапы раз в сутки и при старте (SEC.2, см. backup.ts) ──────────────────────
const backup = () => {
  try {
    console.log(`бэкап: ${runBackups(db, BACKUP_DIR, Date.now())}`);
  } catch (err) {
    console.error('бэкап не удался', err);
  }
};
if (DB_PATH !== ':memory:') {
  backup();
  setInterval(backup, 24 * 60 * 60 * 1000).unref();
}

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
  const now = Date.now();
  // Отказы считаются по причинам (SA.8): в журнал 4xx не пишутся, а в «Здоровье» сводки видны
  const refuse = (status: number, reason: string) => {
    countReject(`batch: ${reason}`);
    send(res, status, reason, cors);
  };
  if (admit(limits, clientIp(req), now) !== 'ok') return refuse(429, 'slow down');
  if (dbFull) return refuse(507, 'full');
  const raw = await readBody(req, LIMITS.body);
  if (raw === null) return refuse(413, 'too large');
  const batch = parseBatch(raw, now);
  if (typeof batch === 'string') return refuse(400, batch);
  if (!limits.quota.take(batch.client, now)) return refuse(429, 'quota');
  for (const reason of batch.dropped ?? []) countReject(reason);
  try {
    insertBatch(db, batch);
  } catch (err) {
    console.error('запись не удалась', err);
    return send(res, 500, 'store', cors);
  }
  send(res, 204, '', cors);
}

/** Доли игроков для «Зала славы»: только чтение готового, персональных данных в ответе нет. */
function handleHall(req: IncomingMessage, res: ServerResponse): void {
  const cors = corsFor(req);
  if (req.method !== 'GET') return send(res, 405, 'method', cors);
  try {
    send(res, 200, hall.json(Date.now()), { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' });
  } catch (err) {
    console.error('зал славы не посчитан', err);
    send(res, 500, 'hall', cors);
  }
}

function corsFor(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin ?? '';
  return ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

/** Запрос игры о покупках: тело — JSON с initData Telegram. */
async function handlePay(req: IncomingMessage, res: ServerResponse, action: 'invoice' | 'owned'): Promise<void> {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') {
    send(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
    return;
  }
  if (req.method !== 'POST') return send(res, 405, 'method');
  if (!ORIGINS.has(req.headers.origin ?? '')) return send(res, 403, 'origin');
  if (!payCfg) return send(res, 503, 'payments off', cors);
  if (!payLimiter.allow(clientKey(clientIp(req)), Date.now())) return send(res, 429, 'slow down', cors);
  const raw = await readBody(req, 8 * 1024);
  if (raw === null) return send(res, 413, 'too large', cors);
  let body: { initData?: unknown; product?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return send(res, 400, 'bad json', cors);
  }
  const user = verifyInitData(typeof body.initData === 'string' ? body.initData : '', BOT_TOKEN, Math.floor(Date.now() / 1000));
  if (!user) return send(res, 401, 'bad initData', cors);
  const json = { ...cors, 'Content-Type': 'application/json' };
  if (action === 'owned') return send(res, 200, JSON.stringify({ owned: ownedProducts(db, user.id) }), json);
  try {
    const result = await createInvoice(db, payCfg, user.id, user.lang, typeof body.product === 'string' ? body.product : '');
    if ('error' in result) return send(res, result.error === 'owned' ? 409 : 400, result.error, cors);
    send(res, 200, JSON.stringify(result), json);
  } catch (err) {
    console.error('счёт не выставлен', err);
    send(res, 502, 'telegram', cors);
  }
}

/** Обновления бота от Telegram — только с секретом, заданным при setWebhook. */
async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!payCfg) return send(res, 404, 'not found');
  if (req.method !== 'POST') return send(res, 405, 'method');
  const given = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] ?? ''));
  const expected = Buffer.from(WEBHOOK_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return send(res, 401, 'secret');
  const raw = await readBody(req, 64 * 1024);
  if (raw === null) return send(res, 413, 'too large');
  try {
    await handleUpdate(db, payCfg, JSON.parse(raw), Date.now());
    send(res, 200, 'ok');
  } catch (err) {
    console.error('обновление бота', err);
    // Сбой Bot API (ответ игроку) не повторяем; сбой записи — пусть Telegram пришлёт ещё раз
    send(res, (err as Error).message?.startsWith('Bot API') ? 200 : 500, 'error');
  }
}

/** Правки текстов обучения для игры (TX.2): маленький ответ, версия в ETag. */
function handleTexts(req: IncomingMessage, res: ServerResponse): void {
  const cors = corsFor(req);
  if (req.method !== 'GET') return send(res, 405, 'method', cors);
  try {
    const { v, body } = textsPayload(db);
    const etag = `"${v}"`;
    // Минута кэша: правка Дениса доходит до игроков быстро, а сервер не дёргают на каждом запуске
    const headers = { ...cors, ETag: etag, 'Cache-Control': 'public, max-age=60', 'Access-Control-Expose-Headers': 'ETag' };
    if (req.headers['if-none-match'] === etag) return void (res.writeHead(304, headers), res.end());
    send(res, 200, body, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  } catch (err) {
    console.error('тексты не выданы', err);
    send(res, 500, 'texts', cors);
  }
}

/**
 * Запись из редактора — только со своей страницы: браузер подставил бы пароль Basic и в
 * форму с чужого сайта, поэтому Origin (и Sec-Fetch-Site, если есть) должны быть свои.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  try {
    return new URL(req.headers.origin ?? '').host === req.headers.host;
  } catch {
    return false;
  }
}

const pageHeaders = (hash: string) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src '${hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  'X-Robots-Tag': 'noindex',
});

/** Редактор текстов обучения (TX.3): страница и сохранение формы. */
async function handleTextsEditor(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!authorized(req)) return send(res, 401, 'Нужен пароль', { 'WWW-Authenticate': 'Basic realm="Starweave", charset="UTF-8"' });
  const page = (status: number, opts: TextsPageOpts) => {
    res.writeHead(status, pageHeaders(TEXTS_SCRIPT_HASH));
    res.end(renderTextsPage(db, opts));
  };
  if (req.method === 'GET') {
    const lang = url.searchParams.get('lang');
    return page(200, { lang: isTextLang(lang) ? lang : 'ru', saved: url.searchParams.get('saved') ?? undefined });
  }
  if (req.method !== 'POST') return send(res, 405, 'method');
  if (!sameOrigin(req)) return send(res, 403, 'origin');
  const raw = await readBody(req, 16 * 1024);
  if (raw === null) return send(res, 413, 'too large');
  const form = new URLSearchParams(raw);
  const lang = form.get('lang');
  const key = form.get('key') ?? '';
  const op = form.get('op') ?? 'save';
  if (!isTextLang(lang)) return send(res, 400, 'lang');
  const now = Date.now();
  let value: string | null = form.get('value') ?? '';
  if (op === 'reset') value = null;
  else if (op === 'ok') {
    if (lang === 'en' && needsTranslation(db).includes(key)) markTranslated(db, key, STATS_USER, now);
    return send(res, 303, '', { Location: savedLocation(lang, key) });
  } else if (op.startsWith('revert:')) {
    const entry = logEntry(db, Number(op.slice(7)));
    if (!entry || entry.key !== key || entry.lang !== lang) return page(422, { lang, error: { key, value: value ?? '', problem: 'log' } });
    value = entry.value;
  }
  const result = saveText(db, lang, key, value, STATS_USER, now);
  if (!result.ok) return page(422, { lang, error: { key, value: value ?? '', problem: result.problem } });
  send(res, 303, '', { Location: savedLocation(lang, key) });
}

/**
 * Тексты для перевода скриптом (TX.5): GET — правки, тексты по умолчанию берёт сам скрипт
 * из репозитория, и список «нужен перевод»; POST — пачка правок одного языка.
 */
async function handleTextsJson(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) return send(res, 401, 'Нужен пароль', { 'WWW-Authenticate': 'Basic realm="Starweave", charset="UTF-8"' });
  const json = { 'Content-Type': 'application/json; charset=utf-8' };
  if (req.method === 'GET') return send(res, 200, JSON.stringify({ ru: overrides(db, 'ru'), en: overrides(db, 'en'), needs: needsTranslation(db) }), json);
  if (req.method !== 'POST') return send(res, 405, 'method');
  // Только JSON: такой запрос с чужого сайта браузер без разрешения CORS не отправит
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'json only');
  const raw = await readBody(req, 64 * 1024);
  if (raw === null) return send(res, 413, 'too large');
  let body: { lang?: unknown; texts?: unknown; author?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return send(res, 400, 'bad json');
  }
  const { lang, texts } = body;
  if (!isTextLang(lang) || !texts || typeof texts !== 'object' || Array.isArray(texts)) return send(res, 400, 'lang, texts');
  const author = typeof body.author === 'string' && /^[a-z]{1,16}$/.test(body.author) ? body.author : 'api';
  const now = Date.now();
  const saved: string[] = [];
  const errors: Record<string, string> = {};
  const needs = new Set(needsTranslation(db));
  for (const [key, value] of Object.entries(texts as Record<string, unknown>)) {
    if (value !== null && typeof value !== 'string') {
      errors[key] = 'type';
      continue;
    }
    const result = saveText(db, lang, key, value, author, now);
    if (!result.ok) {
      errors[key] = result.problem;
      continue;
    }
    // Перевод совпал с прежним английским — пометку «нужен перевод» всё равно снимаем
    if (lang === 'en' && needs.has(key) && needsTranslation(db).includes(key)) markTranslated(db, key, author, now);
    saved.push(key);
  }
  send(res, 200, JSON.stringify({ saved, errors }), json);
}

function handleStats(req: IncomingMessage, res: ServerResponse, url: URL): void {
  if (!authorized(req)) {
    send(res, 401, 'Нужен пароль', { 'WWW-Authenticate': 'Basic realm="Starweave", charset="UTF-8"' });
    return;
  }
  const days = [1, 7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7;
  // Сайт игры: оттуда страница сводки читает карты исходников для стеков ошибок
  const site = [...ORIGINS][0] ?? '';
  const html = renderDashboard(computeStats(db, Date.now(), days), { site, rejects: [...rejects].sort((a, b) => b[1] - a[1]), excluded: EXCLUDE_CLIENTS.length });
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src '${STACK_SCRIPT_HASH}'; connect-src ${site || "'none'"}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    'X-Robots-Tag': 'noindex',
  });
  res.end(html);
}

function fail(res: ServerResponse, err: unknown): void {
  console.error(err);
  if (!res.headersSent) send(res, 500, 'error');
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/v1/events') return void handleEvents(req, res);
    if (url.pathname === '/v1/hall') return handleHall(req, res);
    if (url.pathname === '/stats') return handleStats(req, res, url);
    if (url.pathname === '/v1/texts') return handleTexts(req, res);
    if (url.pathname === '/stats/texts') return void handleTextsEditor(req, res, url).catch((err) => fail(res, err));
    if (url.pathname === '/stats/texts.json') return void handleTextsJson(req, res).catch((err) => fail(res, err));
    if (url.pathname === '/v1/pay/invoice') return void handlePay(req, res, 'invoice');
    if (url.pathname === '/v1/pay/owned') return void handlePay(req, res, 'owned');
    if (url.pathname === '/tg/webhook') return void handleWebhook(req, res);
    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname === '/') return send(res, 200, 'Звёздное плетение — сервер игры');
    send(res, 404, 'not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'error');
  }
});

server.listen(PORT, () => console.log(`слушаю :${PORT}, база ${DB_PATH}, источники: ${[...ORIGINS].join(', ')}, покупки: ${payCfg ? 'вкл' : 'выкл'}`));

const stop = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
