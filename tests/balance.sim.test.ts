import { describe, it } from 'vitest';
import { bestMove, giftGreedy, enterNight, shopGreedy, wonderGreedy } from '../src/core/ai/bot';
import { allContent } from '../src/core/content/pools';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { chooseRoute, currentNode, isWonder, routeOptions, visitWonder, type RouteKind } from '../src/core/route';
import { burnCard, placeCard, startNight } from '../src/core/night';
import { omenDef } from '../src/core/content/omens';

/**
 * Баланс-симуляция: жадный бот играет забеги, печатаем, где он падает и с каким
 * запасом проходит цели. Запуск: `npm run sim` (SIM=1, иначе пропускается).
 * `SIM_DEPTH=off` — как до 0.7, `gift` — дар без тел и развилок, `routes` — дар и развилки без тел, по умолчанию — всё.
 * `SIM_ROUTE=night|bright|comet|telescope` — на развилке всегда этот путь, если он есть (RT.6:
 * сравнить пути по силе и экономике); без него — как решает бот.
 * `SIM_MYTHS=0` — без мифов (MY.6: сравнить), по умолчанию мифы открыты.
 * `SIM_RESONANCE=0` — без Резонанса (RS.1: сравнить), по умолчанию открыт; `SIM_FUSE=0` — пары собирает, но не сливает.
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
    const unlocks = { ...allContent(), myths: process.env.SIM_MYTHS !== '0', resonance: process.env.SIM_RESONANCE !== '0', ...(depth === 'off' ? { gift: false, bodies: [], routes: false } : depth === 'gift' ? { bodies: [], routes: false } : depth === 'routes' ? { bodies: [] } : {}) };
    // Дар ночи (GF.6): сколько раз бот взял, сколько пропустил, какой стала колода к концу
    const gifts = { take: 0, skip: 0, deck: [] as number[] };
    // Экономика и длина забега (RT.6): ночей и лавок за забег, шагов без ночи, золото
    const prefer = process.env.SIM_ROUTE as RouteKind | undefined;
    // Мифы (MY.6): сколько за забег, какие, доля в очках ночей
    const myths = { count: [] as number[], ids: {} as Record<string, number>, light: 0, total: 0 };
    // Резонанс (RS.1): сколько слияний за забег, какие легендарные, в какой главе
    const fused = { count: [] as number[], ids: {} as Record<string, number>, wins: {} as Record<string, number>, ante: [] as number[] };
    const econ = { nights: [] as number[], shops: [] as number[], wonders: { take: 0, skip: 0 }, earned: [] as number[], ante: [] as number[] };
    const walkTo = (run: ReturnType<typeof newRun>) => {
      while (run.phase === 'map') {
        const opts = routeOptions(run.chapter);
        if (run.chapter.at < 0 && opts.length) chooseRoute(run, opts.find((i) => run.chapter.nodes[i]!.route === prefer) ?? opts.find((i) => run.chapter.nodes[i]!.route === 'night') ?? opts[0]!);
        if (!isWonder(currentNode(run).route)) return void startNight(run);
        visitWonder(run);
        // Взял или прошёл мимо — по тому, изменилось ли что-то в забеге (журнала в симе нет)
        const snap = () => JSON.stringify([run.gold, run.deck, run.omens.map((x) => x.id), run.comboLevels]);
        const before = snap();
        wonderGreedy(run);
        econ.wonders[snap() === before ? 'skip' : 'take'] += 1;
      }
    };
    for (let seed = 1; seed <= runs; seed++) {
      const run = newRun({ seed: seed * 7919, skyId: process.env.SIM_SKY ?? 'classic', gentle: !!process.env.SIM_GENTLE, gift: process.env.SIM_GIFT ? { gold: Number(process.env.SIM_GIFT) } : undefined, unlocks });
      let guard = 0;
      let nights = 0;
      let shops = 0;
      let runMyths = 0;
      const legends = new Set<number>();
      // Ночь — как playNight бота, но с событиями: видно мифы
      const playNight = () => {
        while (run.phase === 'night' && run.night?.result === 'playing') {
          const move = bestMove(run);
          if (!move) break;
          if (move.value < 5 && run.night.burnsLeft > 0) {
            burnCard(run, move.handIndex);
            continue;
          }
          for (const e of placeCard(run, move.handIndex, move.cell)) {
            if (e.t !== 'ignite') continue;
            myths.total += e.score.total;
            for (const m of e.score.myths) {
              runMyths += 1;
              myths.ids[m.myth] = (myths.ids[m.myth] ?? 0) + 1;
              myths.light += m.total;
            }
          }
        }
      };
      while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 60) {
        if (run.phase === 'map') (prefer ? walkTo(run) : enterNight(run));
        if (run.phase === 'night') {
          playNight();
          nights += 1;
          const key = `${run.ante}-${currentNode(run).kind}`;
          (ratios[key] ??= []).push(run.night!.score / run.night!.target);
          const n = run.night!;
          (used[key] ??= []).push(Math.min(1, (n.rules.moves - n.movesLeft) / n.rules.moves));
          if ((run.phase as string) === 'gameOver') deaths[key] = (deaths[key] ?? 0) + 1;
        }
        if (run.phase === 'reward') collectReward(run);
        if (run.phase === 'shop') {
          shops += 1;
          if (run.pending[0]?.kind === 'gift') {
            const gold = run.gold;
            giftGreedy(run);
            gifts[run.gold > gold ? 'skip' : 'take'] += 1;
          }
          shopGreedy(run, process.env.SIM_FUSE !== '0');
          for (const o of run.omens) {
            if (!omenDef(o.id).pair || legends.has(o.uid)) continue;
            legends.add(o.uid);
            fused.ids[o.id] = (fused.ids[o.id] ?? 0) + 1;
            fused.ante.push(run.ante);
          }
          leaveShop(run);
        }
      }
      myths.count.push(runMyths);
      fused.count.push(legends.size);
      gifts.deck.push(run.deck.length);
      econ.nights.push(nights);
      econ.shops.push(shops);
      econ.earned.push(run.stats.goldEarned);
      econ.ante.push(Math.min(run.ante, 8));
      for (const o of run.omens) if (omenDef(o.id).pair && run.phase === 'victory') fused.wins[o.id] = (fused.wins[o.id] ?? 0) + 1;
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
    const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);
    const econLine = `путь: ${prefer ?? 'бот'} · ночей ${avg(econ.nights)} · лавок ${avg(econ.shops)} · шагов без ночи взято ${econ.wonders.take}, мимо ${econ.wonders.skip} · золота за забег ${avg(econ.earned)} · глава ${avg(econ.ante)}`;
    const mythLine = `мифы: ${avg(myths.count)} за забег · доля в очках ходов со вспышкой ${Math.round((myths.light / Math.max(1, myths.total)) * 100)}% · ${Object.entries(myths.ids).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')}`;
    const fuseLine = `резонанс: ${avg(fused.count)} за забег · в забегах со слиянием ${fused.count.filter(Boolean).length}/${runs} · глава ${avg(fused.ante)} · ${Object.entries(fused.ids).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n} (побед ${fused.wins[id] ?? 0})`).join(', ')}`;
    console.log(['', `глубина: ${depth}`, ...rows, giftLine, econLine, mythLine, fuseLine, `побед: ${deaths.victory ?? 0}/${runs}`].join('\n'));
  }, 600_000);
});
