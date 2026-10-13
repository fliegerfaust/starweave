import { describe, expect, it } from 'vitest';
import { STARS_PRODUCTS } from '../server/src/catalog.ts';
import { openDb } from '../server/src/db.ts';
import { createInvoice, handleUpdate, ownedProducts, parsePayload, payload, type PaymentsConfig } from '../server/src/payments.ts';
import { signInitData, verifyInitData } from '../server/src/telegram.ts';
import { PRODUCTS, isPermanent } from '../src/store/catalog';

const TOKEN = '123456:TEST-token';
const NOW = 1_800_000_000;

function setup() {
  const db = openDb(':memory:');
  const calls: [string, Record<string, unknown>][] = [];
  const cfg: PaymentsConfig = {
    bot: async (method, params) => {
      calls.push([method, params]);
      return method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true;
    },
    adminChatId: 999,
    gameLink: 'https://t.me/bot/play',
    termsLink: 'https://example.org/terms',
  };
  return { db, cfg, calls };
}

const paid = (userId: number, product: string, charge: string, amount = STARS_PRODUCTS[product]!.stars) => ({
  message: {
    message_id: 1,
    chat: { id: userId, type: 'private' },
    from: { id: userId, language_code: 'ru' },
    successful_payment: { currency: 'XTR', total_amount: amount, invoice_payload: payload(product, userId), telegram_payment_charge_id: charge },
  },
});

describe('покупки: каталог', () => {
  it('цены и товары сервера совпадают с игрой', () => {
    for (const p of PRODUCTS) {
      expect(STARS_PRODUCTS[p.id], p.id).toBeDefined();
      expect(STARS_PRODUCTS[p.id]!.stars).toBe(p.stars);
      expect(STARS_PRODUCTS[p.id]!.permanent).toBe(isPermanent(p.id));
    }
    expect(Object.keys(STARS_PRODUCTS).sort()).toEqual(PRODUCTS.map((p) => p.id).sort());
  });
});

describe('покупки: initData', () => {
  const fields = { auth_date: String(NOW), query_id: 'AAA', user: JSON.stringify({ id: 42, language_code: 'ru', first_name: 'Д' }) };

  it('подпись бота принимается, чужая — нет', () => {
    const data = signInitData(fields, TOKEN);
    expect(verifyInitData(data, TOKEN, NOW + 60)).toEqual({ id: 42, lang: 'ru' });
    expect(verifyInitData(data, '999:other', NOW + 60)).toBeNull();
    expect(verifyInitData(data.replace('42', '43'), TOKEN, NOW + 60)).toBeNull();
  });

  it('устаревшие данные запуска отклоняются', () => {
    expect(verifyInitData(signInitData(fields, TOKEN), TOKEN, NOW + 2 * 86400)).toBeNull();
    expect(verifyInitData('', TOKEN, NOW)).toBeNull();
  });
});

describe('покупки: путь оплаты', () => {
  it('счёт, проверка перед оплатой, запись, повторно не продаём', async () => {
    const { db, cfg, calls } = setup();
    const inv = await createInvoice(db, cfg, 42, 'ru', 'atlas');
    expect(inv).toEqual({ link: 'https://t.me/$invoice' });
    const params = calls[0]![1];
    expect(params).toMatchObject({ currency: 'XTR', provider_token: '', prices: [{ amount: 250 }] });
    expect(parsePayload(params.payload)).toEqual({ product: 'atlas', userId: 42 });

    await handleUpdate(db, cfg, { pre_checkout_query: { id: 'q1', from: { id: 42 }, currency: 'XTR', total_amount: 250, invoice_payload: params.payload as string } }, 0);
    expect(calls.at(-1)).toEqual(['answerPreCheckoutQuery', { pre_checkout_query_id: 'q1', ok: true }]);

    await handleUpdate(db, cfg, paid(42, 'atlas', 'ch-1'), 1);
    await handleUpdate(db, cfg, paid(42, 'atlas', 'ch-1'), 2); // повтор от Telegram
    expect(ownedProducts(db, 42)).toEqual(['atlas']);
    expect(ownedProducts(db, 7)).toEqual([]);
    expect(calls.some(([m, p]) => m === 'sendMessage' && p.chat_id === 999)).toBe(true);

    expect(await createInvoice(db, cfg, 42, 'ru', 'atlas')).toEqual({ error: 'owned' });
    expect(await createInvoice(db, cfg, 42, 'ru', 'tip_small')).toHaveProperty('link');
    expect(await createInvoice(db, cfg, 42, 'ru', 'gold_9999')).toEqual({ error: 'unknown product' });
  });

  it('подменённая сумма или чужой игрок — отказ перед оплатой', async () => {
    const { db, cfg, calls } = setup();
    const pl = payload('atlas', 42);
    await handleUpdate(db, cfg, { pre_checkout_query: { id: 'q', from: { id: 42 }, currency: 'XTR', total_amount: 1, invoice_payload: pl } }, 0);
    expect(calls.at(-1)![1]).toMatchObject({ ok: false });
    await handleUpdate(db, cfg, { pre_checkout_query: { id: 'q', from: { id: 43 }, currency: 'XTR', total_amount: 250, invoice_payload: pl } }, 0);
    expect(calls.at(-1)![1]).toMatchObject({ ok: false });
  });

  it('набор поддержки открывает атлас; возврат забирает покупку', async () => {
    const { db, cfg } = setup();
    await handleUpdate(db, cfg, paid(5, 'supporter', 'ch-s'), 1);
    expect(await createInvoice(db, cfg, 5, 'en', 'atlas')).toEqual({ error: 'owned' });
    await handleUpdate(db, cfg, { message: { message_id: 2, chat: { id: 5, type: 'private' }, from: { id: 5 }, refunded_payment: { telegram_payment_charge_id: 'ch-s' } } }, 2);
    expect(ownedProducts(db, 5)).toEqual([]);
  });

  it('чаевые не попадают в купленное навсегда', async () => {
    const { db, cfg } = setup();
    await handleUpdate(db, cfg, paid(8, 'tip_medium', 'ch-t'), 1);
    expect(ownedProducts(db, 8)).toEqual([]);
  });

  it('обращение в поддержку уходит автору, автор отвечает /reply', async () => {
    const { db, cfg, calls } = setup();
    await handleUpdate(db, cfg, { message: { message_id: 3, chat: { id: 77, type: 'private' }, from: { id: 77, username: 'p' }, text: 'Атлас не открылся' } }, 0);
    expect(calls.find(([m, p]) => m === 'sendMessage' && p.chat_id === 999)![1].text).toContain('77 @p');
    await handleUpdate(db, cfg, { message: { message_id: 4, chat: { id: 999, type: 'private' }, from: { id: 999 }, text: '/reply 77 Сейчас проверю' } }, 0);
    expect(calls.some(([m, p]) => m === 'sendMessage' && p.chat_id === 77 && p.text === 'Сейчас проверю')).toBe(true);
  });
});
