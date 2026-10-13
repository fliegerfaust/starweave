import { randomBytes } from 'node:crypto';
import { IMPLIED, STARS_PRODUCTS } from './catalog.ts';
import type { Db } from './db.ts';
import type { BotApi } from './telegram.ts';

/**
 * Покупки за Telegram Stars. Путь оплаты:
 *   игра → POST /v1/pay/invoice → createInvoiceLink → окно оплаты Telegram →
 *   бот: pre_checkout_query (проверяем, отвечаем за 10 с) → successful_payment (записываем) →
 *   игра спрашивает POST /v1/pay/owned.
 * Возвраты (refundStarPayment или из клиента Telegram) приходят как refunded_payment.
 */

export interface PaymentsConfig {
  bot: BotApi;
  /** Чат автора: сюда пересылаются обращения из /paysupport. */
  adminChatId: number | null;
  /** Ссылка, которой бот открывает игру. */
  gameLink: string;
  termsLink: string;
}

/** Товары, которыми игрок владеет навсегда (без возвращённых). */
export function ownedProducts(db: Db, userId: number): string[] {
  const rows = db.prepare('SELECT DISTINCT product FROM purchases WHERE user_id = ? AND refunded = 0').all(userId) as { product: string }[];
  return rows.map((r) => r.product).filter((p) => STARS_PRODUCTS[p]?.permanent);
}

/** Уже открыто — второй раз не продаём (набор поддержки открывает и атлас). */
function alreadyOwned(db: Db, userId: number, product: string): boolean {
  const owned = ownedProducts(db, userId);
  if (owned.includes(product)) return true;
  return owned.some((p) => IMPLIED[p]?.includes(product));
}

export function payload(product: string, userId: number): string {
  return `${product}:${userId}:${randomBytes(6).toString('hex')}`;
}

export function parsePayload(text: unknown): { product: string; userId: number } | null {
  if (typeof text !== 'string') return null;
  const m = /^([a-z][a-z0-9_]{1,30}):(\d{1,16}):[0-9a-f]{12}$/.exec(text);
  if (!m || !STARS_PRODUCTS[m[1]!]) return null;
  return { product: m[1]!, userId: Number(m[2]) };
}

export type InvoiceResult = { link: string } | { error: 'unknown product' | 'owned' };

export async function createInvoice(db: Db, cfg: PaymentsConfig, userId: number, lang: 'ru' | 'en', product: string): Promise<InvoiceResult> {
  const def = STARS_PRODUCTS[product];
  if (!def) return { error: 'unknown product' };
  if (def.permanent && alreadyOwned(db, userId, product)) return { error: 'owned' };
  const link = (await cfg.bot('createInvoiceLink', {
    title: def.title[lang],
    description: def.description[lang],
    payload: payload(product, userId),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: def.title[lang], amount: def.stars }],
  })) as string;
  return { link };
}

const SUPPORT = {
  ru: 'Если с покупкой что-то не так, опиши проблему следующим сообщением — его прочитает автор игры и ответит здесь. Возврат Stars возможен, если купленное не открылось.',
  en: 'If something went wrong with a purchase, describe it in your next message — the author will read it and reply here. Stars can be refunded if the purchase did not unlock.',
};
const TERMS = {
  ru: 'Покупки за Telegram Stars: «Звёздный атлас», набор мецената и внешний вид открываются навсегда для твоего аккаунта Telegram в этой игре; чаевые ничего не открывают. Ничего из купленного не даёт преимущества в игре. Возврат — через /paysupport.',
  en: 'Telegram Stars purchases: the Star Atlas, the Patron Pack and cosmetics unlock forever for your Telegram account in this game; tips unlock nothing. Nothing you buy gives an in-game advantage. Refunds — via /paysupport.',
};
const START = {
  ru: '✦ «Звёздное плетение» — карточная головоломка о созвездиях. Нажми «Играть».',
  en: '✦ Starweave — a card puzzle about constellations. Tap “Play”.',
};
const THANKS = {
  ru: 'Спасибо! Покупка прошла — вернись в игру, всё уже открыто. ✦',
  en: 'Thank you! The purchase went through — return to the game, everything is unlocked. ✦',
};

interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; language_code?: string; username?: string; first_name?: string };
  text?: string;
  successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string };
  refunded_payment?: { telegram_payment_charge_id: string };
}

interface TgUpdate {
  message?: TgMessage;
  pre_checkout_query?: { id: string; from: { id: number; language_code?: string }; currency: string; total_amount: number; invoice_payload: string };
}

const langOf = (code: string | undefined): 'ru' | 'en' => (code && ['ru', 'be', 'kk', 'uk', 'uz'].includes(code) ? 'ru' : 'en');

/** Обработка одного обновления бота. Ошибки Bot API пробрасываются наружу (в журнал). */
export async function handleUpdate(db: Db, cfg: PaymentsConfig, update: TgUpdate, now: number): Promise<void> {
  const q = update.pre_checkout_query;
  if (q) {
    const p = parsePayload(q.invoice_payload);
    const def = p ? STARS_PRODUCTS[p.product] : undefined;
    let error = '';
    if (!p || !def || q.currency !== 'XTR' || q.total_amount !== def.stars || p.userId !== q.from.id) error = 'bad';
    else if (def.permanent && alreadyOwned(db, p.userId, p.product)) error = 'owned';
    const lang = langOf(q.from.language_code);
    await cfg.bot('answerPreCheckoutQuery', error
      ? { pre_checkout_query_id: q.id, ok: false, error_message: error === 'owned' ? (lang === 'ru' ? 'Это уже куплено.' : 'You already own this.') : (lang === 'ru' ? 'Счёт устарел, открой покупку в игре заново.' : 'This invoice is outdated, open the purchase in the game again.') }
      : { pre_checkout_query_id: q.id, ok: true });
    return;
  }

  const m = update.message;
  if (!m || m.chat.type !== 'private' || !m.from) return;
  const lang = langOf(m.from.language_code);
  const send = (chatId: number, text: string, extra: Record<string, unknown> = {}) => cfg.bot('sendMessage', { chat_id: chatId, text, ...extra });

  if (m.successful_payment) {
    const sp = m.successful_payment;
    const p = parsePayload(sp.invoice_payload);
    db.prepare('INSERT OR IGNORE INTO purchases (charge_id, user_id, product, stars, ts) VALUES (?, ?, ?, ?, ?)').run(
      sp.telegram_payment_charge_id,
      m.from.id,
      p?.product ?? 'unknown',
      sp.total_amount,
      now,
    );
    await send(m.chat.id, THANKS[lang]);
    if (cfg.adminChatId) await send(cfg.adminChatId, `⭐ ${p?.product ?? '?'} · ${sp.total_amount} Stars · ${m.from.id}\n${sp.telegram_payment_charge_id}`).catch(() => undefined);
    return;
  }
  if (m.refunded_payment) {
    db.prepare('UPDATE purchases SET refunded = 1 WHERE charge_id = ?').run(m.refunded_payment.telegram_payment_charge_id);
    return;
  }

  const text = (m.text ?? '').trim();
  const isAdmin = cfg.adminChatId !== null && m.chat.id === cfg.adminChatId;
  if (isAdmin && text.startsWith('/')) return adminCommand(db, cfg, text, send);
  const playButton = { reply_markup: { inline_keyboard: [[{ text: lang === 'ru' ? '✦ Играть' : '✦ Play', url: cfg.gameLink }]] } };

  if (text.startsWith('/start')) return void (await send(m.chat.id, START[lang], playButton));
  if (text.startsWith('/paysupport')) return void (await send(m.chat.id, SUPPORT[lang]));
  if (text.startsWith('/terms')) return void (await send(m.chat.id, `${TERMS[lang]}\n\n${cfg.termsLink}`));
  if (text && !text.startsWith('/') && cfg.adminChatId) {
    // Обращение в поддержку — автору, с номером игрока для ответа (/reply)
    const who = m.from.username ? `@${m.from.username}` : (m.from.first_name ?? '');
    await send(cfg.adminChatId, `✉ ${m.from.id} ${who}\n${text.slice(0, 3500)}`);
    await send(m.chat.id, lang === 'ru' ? 'Передал автору. Ответ придёт сюда.' : 'Sent to the author. The reply will come here.');
    return;
  }
  await send(m.chat.id, START[lang], playButton);
}

/**
 * Команды автора в чате с ботом:
 *   /reply <id игрока> <текст>  — ответить на обращение
 *   /refund <id игрока> <charge_id> — вернуть Stars (Telegram пришлёт refunded_payment)
 *   /sales — сводка покупок
 */
async function adminCommand(db: Db, cfg: PaymentsConfig, text: string, send: (chatId: number, text: string) => Promise<unknown>): Promise<void> {
  const admin = cfg.adminChatId!;
  const [cmd, a, ...rest] = text.split(/\s+/);
  try {
    if (cmd === '/reply' && a && rest.length) {
      await send(Number(a), rest.join(' '));
      await send(admin, '✓');
    } else if (cmd === '/refund' && a && rest[0]) {
      await cfg.bot('refundStarPayment', { user_id: Number(a), telegram_payment_charge_id: rest[0] });
      db.prepare('UPDATE purchases SET refunded = 1 WHERE charge_id = ?').run(rest[0]);
      await send(admin, '✓ возврат');
    } else if (cmd === '/sales') {
      const rows = db.prepare('SELECT product, COUNT(*) AS n, SUM(stars) AS stars FROM purchases WHERE refunded = 0 GROUP BY product ORDER BY stars DESC').all() as { product: string; n: number; stars: number }[];
      await send(admin, rows.length ? rows.map((r) => `${r.product}: ${r.n} шт · ${r.stars} ⭐`).join('\n') : 'Покупок пока нет');
    } else {
      await send(admin, '/reply <id> <текст> · /refund <id> <charge_id> · /sales');
    }
  } catch (err) {
    await send(admin, `Ошибка: ${(err as Error).message}`);
  }
}
