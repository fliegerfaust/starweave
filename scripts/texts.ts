// Тексты обучения на сервере (TX.5): поток «Денис поправил русский → Claude переводит».
//
//   npm run texts:pull                 — что нужно перевести: texts/translate.json (ключ → ru, en)
//   npm run texts:push -- texts/en.json — отправить переводы { "ключ": "English" } (автор claude)
//   npm run texts:fold                 — к релизу: правки сервера → тексты по умолчанию в ru.ts/en.ts
//
// Пароль сводки — в STATS_PASSWORD (на сервере: ssh denval grep STATS_PASSWORD /opt/starweave/.env),
// адрес — STATS_URL (по умолчанию https://game.denvalclass.ru).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { defaultText, textCatalog, type TextLang } from '../src/i18n/texts.ts';
import { foldText } from './texts-fold.ts';

const BASE = (process.env.STATS_URL ?? 'https://game.denvalclass.ru').replace(/\/$/, '');
const PASSWORD = process.env.STATS_PASSWORD ?? '';
const USER = process.env.STATS_USER ?? 'denis';
if (!PASSWORD) {
  console.error('Нужен STATS_PASSWORD (пароль сводки): ssh denval grep STATS_PASSWORD /opt/starweave/.env');
  process.exit(1);
}
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}` };

interface Remote {
  ru: Record<string, string>;
  en: Record<string, string>;
  needs: string[];
}

async function remote(): Promise<Remote> {
  const res = await fetch(`${BASE}/stats/texts.json`, { headers: auth });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as Remote;
}

const [cmd, file] = process.argv.slice(2);

if (cmd === 'pull') {
  const r = await remote();
  const out = Object.fromEntries(r.needs.map((key) => [key, { ru: r.ru[key] ?? defaultText('ru', key), en: r.en[key] ?? defaultText('en', key) }]));
  mkdirSync('texts', { recursive: true });
  writeFileSync('texts/translate.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(r.needs.length ? `К переводу ${r.needs.length}: texts/translate.json` : 'Переводить нечего.');
} else if (cmd === 'push' && file) {
  const texts = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const res = await fetch(`${BASE}/stats/texts.json`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'en', author: 'claude', texts }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const { saved, errors } = (await res.json()) as { saved: string[]; errors: Record<string, string> };
  console.log(`Сохранено ${saved.length}.`);
  for (const [k, why] of Object.entries(errors)) console.log(`  не принято ${k}: ${why}`);
  if (Object.keys(errors).length) process.exit(1);
} else if (cmd === 'fold') {
  const r = await remote();
  if (r.needs.length) console.warn(`Внимание: ${r.needs.length} ключей ещё без перевода (npm run texts:pull).`);
  const missed: string[] = [];
  for (const lang of ['ru', 'en'] as TextLang[]) {
    const path = `src/i18n/${lang}.ts`;
    let src = readFileSync(path, 'utf8');
    const known = new Set(textCatalog(lang).map((e) => e.key));
    for (const [key, value] of Object.entries(r[lang])) {
      if (!known.has(key)) continue;
      const next = foldText(src, key, value);
      if (next === null) missed.push(`${lang} ${key}`);
      else src = next;
    }
    writeFileSync(path, src);
    console.log(`${path}: правок ${Object.keys(r[lang]).length}`);
  }
  if (missed.length) console.log(`Вручную: ${missed.join(', ')}`);
  console.log('Дальше: npm test, коммит, после выкладки — «По умолчанию» у перенесённых текстов в редакторе не нужно: совпавшая правка игрой не применяется.');
} else {
  console.error('npm run texts:pull | texts:push -- <файл.json> | texts:fold');
  process.exit(1);
}
