import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('store/telegram/splash.svg', 'utf8');
const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 760, height: 560 } });
await p.setContent(`<body style="margin:0;display:flex;gap:30px;align-items:center;padding:20px;background:#17212b">
<div style="background:#070818;padding:0"><img src="${src}" width="512" height="512" style="display:block;outline:1px dashed #444"></div>
<div style="display:flex;flex-direction:column;gap:20px"><div style="background:#070818;padding:20px"><img src="${src}" width="120"></div><div style="background:#fff;padding:20px"><img src="${src}" width="120"></div></div></body>`);
await p.waitForTimeout(300);
await p.screenshot({ path: process.argv[2] });
await b.close();
