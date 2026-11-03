import { LANGS, useTexts, type Lang } from '@/i18n';
import { apiBase } from '@/store/stars-payments';

/**
 * Тексты обучения с сервера (TX.4). Первый запуск не ждёт сеть дольше `WAIT_MS`: при запуске
 * сразу берутся тексты с прошлого раза, запрос идёт параллельно со шрифтами, и если сервер
 * ответил вовремя — его тексты сразу, иначе ответ ложится на устройство и работает со
 * следующего запуска. Без сервера, офлайн и при битом ответе — тексты из сборки.
 */
export const TEXTS_KEY = 'starweave.texts.v1';
const WAIT_MS = 1500;
const FETCH_MS = 8000;

export interface ServerTexts {
  /** Версия набора: меняется с каждой правкой. */
  v: string;
  texts: Partial<Record<Lang, Record<string, string>>>;
}

export function parseTexts(raw: unknown): ServerTexts | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, texts } = raw as { v?: unknown; texts?: unknown };
  if (typeof v !== 'string' || !texts || typeof texts !== 'object' || Array.isArray(texts)) return null;
  const out: ServerTexts = { v, texts: {} };
  for (const lang of LANGS) {
    const set = (texts as Record<string, unknown>)[lang];
    if (!set || typeof set !== 'object' || Array.isArray(set)) continue;
    out.texts[lang] = Object.fromEntries(Object.entries(set).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }
  return out;
}

export function cachedTexts(): ServerTexts | null {
  try {
    return parseTexts(JSON.parse(localStorage.getItem(TEXTS_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function store(data: ServerTexts): void {
  try {
    localStorage.setItem(TEXTS_KEY, JSON.stringify(data));
  } catch {
    // Хранилище закрыто (приватный режим): тексты придут в следующий раз
  }
}

/** Ставит набор в словари обоих языков; `null` — тексты сборки. */
export function applyTexts(data: ServerTexts | null): void {
  for (const lang of LANGS) useTexts(lang, data?.texts[lang] ?? {});
}

/** Свежий набор с сервера и на устройство; `null` — сервер недоступен или ответ битый. */
export async function fetchTexts(base: string): Promise<ServerTexts | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(`${base}/v1/texts`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = parseTexts(await res.json());
    if (data) store(data);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Запуск игры: тексты с прошлого раза сразу, свежие — если успели за `wait` мс. */
export async function loadTexts(base = apiBase(), wait = WAIT_MS): Promise<void> {
  applyTexts(cachedTexts());
  if (!base) return;
  let timer = 0;
  const late = new Promise<undefined>((resolve) => (timer = window.setTimeout(resolve, wait)));
  const fresh = await Promise.race([fetchTexts(base), late]);
  window.clearTimeout(timer);
  if (fresh) applyTexts(fresh);
}
