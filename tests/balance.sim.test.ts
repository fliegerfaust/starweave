import { describe, it } from 'vitest';
import { giftGreedy, enterNight, playNight, shopGreedy } from '../src/core/ai/bot';
import { allContent } from '../src/core/content/pools';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { currentNode } from '../src/core/route';

/**
 * Баланс-симуляция: жадный бот играет забеги, печатаем, где он падает и с каким
 * запасом проходит цели. Запуск: `npm run sim` (SIM=1, иначе пропускается).
 * `SIM_DEPTH=off` — как до 0.7, `gift` — дар без тел и развилок, `routes` — дар и развилки без тел, по умолчанию — всё.
 */
describe.skipIf(!process.env.SIM)('баланс', () => {
  it('кривая целей', () => {
    const runs = Number(process.env.SIM_RUNS ?? 60);
    const deaths: Record<string, number> = {};
    const ratios: Record<string, number[]> = {};
    // Доля ходов, ушедших на цель: ночь кончается, как только цель набрана, поэтому
    // это и есть сложность. ~0.5 — «прошёл не думая», ~0.85+ — на грани.
    const used: Record<string, number[]> = {};
    const depth = process.env.SIM_DEPTH ?? 'all';
    const unlocks = { ...allContent(), ...(depth === 'off' ? { gift: false, bodies: [], routes: false } : depth === 'gift' ? { bodies: [], routes: false } : depth === 'routes' ? { bodies: [] } : {}) };
    // Дар ночи (GF.6): сколько раз бот взял, сколько пропустил, какой стала колода к концу
    const gifts = { take: 0, skip: 0, deck: [] as number[] };
    for (let seed = 1; seed <= runs; seed++) {
      const run = newRun({ seed: seed * 7919, skyId: process.env.SIM_SKY ?? 'classic', gentle: !!process.env.SIM_GENTLE, gift: process.env.SIM_GIFT ? { gold: Number(process.env.SIM_GIFT) } : undefined, unlocks });
      let guard = 0;
      while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 60) {
        if (run.phase === 'map') enterNight(run);
        if (run.phase === 'night') {
          playNight(run);
          const key = `${run.ante}-${currentNode(run).kind}`;
          (ratios[key] ??= []).push(run.night!.score / run.night!.target);
          const n = run.night!;
          (used[key] ??= []).push(Math.min(1, (n.rules.moves - n.movesLeft) / n.rules.moves));
          if ((run.phase as string) === 'gameOver') deaths[key] = (deaths[key] ?? 0) + 1;
        }
        if (run.phase === 'reward') collectReward(run);
        if (run.phase === 'shop') {
          if (run.pending[0]?.kind === 'gift') {
            const gold = run.gold;
            giftGreedy(run);
            gifts[run.gold > gold ? 'skip' : 'take'] += 1;
          }
          shopGreedy(run);
          leaveShop(run);
        }
      }
      gifts.deck.push(run.deck.length);
      if (run.phase === 'victory') deaths.victory = (deaths.victory ?? 0) + 1;
    }
    const rows = Object.entries(ratios).map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)]!;
      const u = [...used[key]!].sort((a, b) => a - b);
      const uMed = u[Math.floor(u.length / 2)]!;
      return `${key.padEnd(12)} n=${String(list.length).padStart(3)} очки/цель=${med.toFixed(2)} ходов=${Math.round(uMed * 100)}% смертей=${deaths[key] ?? 0}`;
    });
    const deckMed = [...gifts.deck].sort((a, b) => a - b)[Math.floor(gifts.deck.length / 2)];
    const giftLine = depth === 'off' ? 'дар выключен' : `дар: взято ${gifts.take}, пропущено ${gifts.skip} (${Math.round((gifts.skip / Math.max(1, gifts.take + gifts.skip)) * 100)}%), колода к концу ~${deckMed}`;
    console.log(['', `глубина: ${depth}`, ...rows, giftLine, `побед: ${deaths.victory ?? 0}/${runs}`].join('\n'));
  }, 600_000);
});
