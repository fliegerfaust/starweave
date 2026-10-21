import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка данных запуска Mini App (initData): Telegram подписывает их токеном бота,
 * подделать игрока без токена нельзя. core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export interface TgUser {
  id: number;
  lang: 'ru' | 'en';
}

/** Данные запуска старше суток не принимаем: их могли подсмотреть и повторить. */
export const INIT_DATA_TTL = 24 * 60 * 60;

export function verifyInitData(initData: string, botToken: string, nowSec: number): TgUser | null {
  if (!initData || initData.length > 4096 || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > INIT_DATA_TTL) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as { id?: unknown; language_code?: unknown } | null;
    if (!user || typeof user.id !== 'number' || !Number.isSafeInteger(user.id)) return null;
    const code = typeof user.language_code === 'string' ? user.language_code : '';
    return { id: user.id, lang: ['ru', 'be', 'kk', 'uk', 'uz'].includes(code) ? 'ru' : 'en' };
  } catch {
    return null;
  }
}

/** Подписать initData — для тестов и локальной проверки. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export type BotApi = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** Вызов Bot API. Ошибка Telegram — исключение с его описанием. */
export function botApi(botToken: string): BotApi {
  return async (method, params) => {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
    if (!data?.ok) throw new Error(`Bot API ${method}: ${data?.description ?? res.status}`);
    return data.result;
  };
}
