import { describe, it } from 'vitest';
import { playNight, shopGreedy } from '../src/core/ai/bot';
import { startNight } from '../src/core/night';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { NIGHT_KINDS } from '../src/core/types';

/**
 * Баланс-симуляция: жадный бот играет забеги, печатаем, где он падает и с каким
 * запасом проходит цели. Запуск: `npm run sim` (SIM=1, иначе пропускается).
 */
describe.skipIf(!process.env.SIM)('баланс', () => {
  it('кривая целей', () => {
    const runs = Number(process.env.SIM_RUNS ?? 60);
    const deaths: Record<string, number> = {};
    const ratios: Record<string, number[]> = {};
    // Доля ходов, ушедших на цель: ночь кончается, как только цель набрана, поэтому
    // это и есть сложность. ~0.5 — «прошёл не думая», ~0.85+ — на грани.
    const used: Record<string, number[]> = {};
    for (let seed = 1; seed <= runs; seed++) {
      const run = newRun({ seed: seed * 7919 });
      let guard = 0;
      while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 60) {
        if (run.phase === 'map') startNight(run);
        if (run.phase === 'night') {
          playNight(run);
          const key = `${run.ante}-${NIGHT_KINDS[run.nightIndex]}`;
          (ratios[key] ??= []).push(run.night!.score / run.night!.target);
          const n = run.night!;
          (used[key] ??= []).push(Math.min(1, (n.rules.moves - n.movesLeft) / n.rules.moves));
          if ((run.phase as string) === 'gameOver') deaths[key] = (deaths[key] ?? 0) + 1;
        }
        if (run.phase === 'reward') collectReward(run);
        if (run.phase === 'shop') {
          shopGreedy(run);
          leaveShop(run);
        }
      }
      if (run.phase === 'victory') deaths.victory = (deaths.victory ?? 0) + 1;
    }
    const rows = Object.entries(ratios).map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)]!;
      const u = [...used[key]!].sort((a, b) => a - b);
      const uMed = u[Math.floor(u.length / 2)]!;
      return `${key.padEnd(12)} n=${String(list.length).padStart(3)} очки/цель=${med.toFixed(2)} ходов=${Math.round(uMed * 100)}% смертей=${deaths[key] ?? 0}`;
    });
    console.log(['', ...rows, `побед: ${deaths.victory ?? 0}/${runs}`].join('\n'));
  }, 600_000);
});
