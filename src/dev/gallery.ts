import { cardBack, cardFace } from '@/art/card';
import { renderNebula } from '@/art/nebula';
import { bossSigil, chartIcon, omenSigil, ritualIcon } from '@/art/sigil';
import { BOSS_LIST, OMEN_LIST, RITUAL_LIST } from '@/core';
import { GLYPHS, SUITS } from '@/core/types';

/** Отладочная витрина графики: `?gallery`. */
export function showGallery(root: HTMLElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  root.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:16px;color:#eee;font-family:sans-serif;pointer-events:auto';
  const nebula = renderNebula(window.innerWidth, window.innerHeight, 7);
  nebula.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1';
  root.append(nebula);
  const row = (title: string, items: HTMLCanvasElement[], cssW: number) => {
    const h = document.createElement('h3');
    h.textContent = title;
    root.append(h);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
    for (const c of items) {
      c.style.width = `${cssW}px`;
      div.append(c);
    }
    root.append(div);
  };
  const W = 84;
  for (const suit of SUITS) row(suit, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => cardFace({ suit, rank }, W, dpr)), W * 1.24);
  row('глифы', GLYPHS.map((glyph, i) => cardFace({ suit: SUITS[i % 4]!, rank: 7, glyph }, W, dpr)), W * 1.24);
  row('рубашка и туман', [cardBack(W, dpr), cardFace({ suit: 'moon', rank: 5 }, W, dpr, { hideRank: true })], W * 1.24);
  row('Знамения', OMEN_LIST.map((o) => omenSigil(o.id, 64, dpr)), 64);
  row('Затмения', BOSS_LIST.map((b) => bossSigil(b.id, 64, dpr)), 64);
  row('ритуалы и карты', [...RITUAL_LIST.map((r) => ritualIcon(r.id, 56, dpr)), chartIcon('flush', 56, dpr)], 56);
}
