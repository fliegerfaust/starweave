// Арт игры для витрин дизайна (правило 0.5.0: каждый экран — витрина из трёх вариантов).
//   node scripts/vitrine-art.mjs <папка>        — выгрузить всё в <папка>
// Рисует тем же кодом, что игра (src/art), в Chrome без окна и кладёт картинки:
// карты всех мастей и рангов (с глифами и небесными телами), рубашки, сигилы Знамений и Затмений,
// значки звёздных карт, ритуалов и пакетов, туманности глав. Если есть cwebp —
// в WebP (вес витрины ×5 меньше), иначе PNG.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const out = process.argv[2];
if (!out) {
  console.error('Куда класть: node scripts/vitrine-art.mjs <папка>');
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, '..');
await mkdir(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5197, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(server.resolvedUrls.local[0]);
  const files = await page.evaluate(async () => {
    await document.fonts.ready;
    const card = await import('/src/art/card.ts');
    const sig = await import('/src/art/sigil.ts');
    const neb = await import('/src/art/nebula.ts');
    const { BACKS } = await import('/src/art/cosmetics.ts');
    const { OMENS } = await import('/src/core/content/omens.ts');
    const { BOSSES } = await import('/src/core/content/bosses.ts');
    const { RITUALS } = await import('/src/core/content/rituals.ts');
    const { SUITS, GLYPHS, COMBO_IDS, BODY_IDS } = await import('/src/core/types.ts');
    const res = {};
    const png = (c) => c.toDataURL('image/png');
    for (const s of SUITS) for (let r = 1; r <= 9; r++) res[`card-${s}-${r}.png`] = png(card.cardFace({ suit: s, rank: r }, 120, 2));
    GLYPHS.forEach((g, i) => (res[`card-${SUITS[i % 4]}-${7 + (i % 3)}-${g}.png`] = png(card.cardFace({ suit: SUITS[i % 4], rank: 7 + (i % 3), glyph: g }, 120, 2))));
    // Небесные тела (GF.4): каждое — на всех мастях, ранги как в витрине дара
    const BODY_RANK = { polaris: 5, meteor: 6, pulsar: 4, twin: 4, nebula: 7, blackhole: 3 };
    for (const b of BODY_IDS) for (const s of SUITS) res[`card-${s}-${BODY_RANK[b]}-${b}.png`] = png(card.cardFace({ suit: s, rank: BODY_RANK[b], body: b }, 120, 2));
    for (const b of BACKS) res[`back-${b.id}.png`] = png(card.cardBack(160, 2, b.id));
    for (const id of Object.keys(OMENS)) res[`omen-${id}.png`] = png(sig.omenSigil(id, 56, 2));
    for (const id of Object.keys(BOSSES)) res[`boss-${id}.png`] = png(sig.bossSigil(id, 56, 2));
    for (const id of COMBO_IDS) res[`chart-${id}.png`] = png(sig.chartIcon(id, 48, 2));
    for (const id of Object.keys(RITUALS)) res[`ritual-${id}.png`] = png(sig.ritualIcon(id, 48, 2));
    for (const p of ['omen', 'ritual', 'chart']) res[`pack-${p}.png`] = png(sig.packIcon(p, 56, 2));
    neb.ANTE_NEBULAE.forEach((pal, i) => (res[`nebula-${i + 1}.jpg`] = neb.renderNebula(720, 1400, 7 + i, pal, 1).toDataURL('image/jpeg', 0.86)));
    return res;
  });
  let webp = true;
  try {
    execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  } catch {
    webp = false;
  }
  for (const [name, url] of Object.entries(files)) {
    const file = path.join(out, name);
    await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
    if (!webp) continue;
    const target = file.replace(/\.(png|jpg)$/, '.webp');
    execFileSync('cwebp', ['-quiet', '-q', name.endsWith('.jpg') ? '80' : '90', '-alpha_q', '95', file, '-o', target]);
    await rm(file);
  }
  console.log(`${Object.keys(files).length} картинок → ${out}${webp ? ' (WebP)' : ''}`);
} finally {
  await browser.close();
  await server.close();
}
