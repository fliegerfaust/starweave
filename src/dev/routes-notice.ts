import { planChapter } from '@/core/route';
import type { App } from '@/game/app';

/**
 * Проверка ON.1 (только в разработке): как игра говорит об открытии Развилок.
 * `?routesfx=open` — первая ночь 3-й главы, Развилки только что открылись: лента «Открыто».
 * `?routesfx=fork` — первая карта неба с развилкой: подсказка у её звёзд.
 */
export async function showRoutesNotice(app: App, variant: string): Promise<void> {
  Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, bestAnte: 3, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
  app.runs.startRun('classic', false, 0, 4242);
  const run = app.run!;
  if (variant === 'open') {
    // Третья глава, развилок в этом забеге ещё нет: цепочка из трёх ночей
    run.ante = 3;
    run.unlocks.routes = false;
    run.chapter = planChapter(run);
    app.runs.beginNight(0);
  } else {
    run.unlocks.routes = true;
    run.chapter = planChapter(run);
  }
  await app.router.route();
}
