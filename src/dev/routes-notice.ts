import { planChapter } from '@/core/route';
import type { App } from '@/game/app';
import { h } from '@/ui/dom';
import { sceneRibbon, sceneWindow } from '@/ui/scene-window';
import { routeIcon } from '@/ui/screens/sky-map';
import { button, toast } from '@/ui/widgets';

/**
 * Витрина ON.1 (только в разработке): как сказать игроку, что открылись Развилки.
 * `?routesfx=a1|a2` — момент открытия (дошёл до 3-й главы, старт ночи): баннер или тост.
 * `?routesfx=b|c` — первая карта неба с развилками: окно-сцена или подсказка у звёзд.
 */
export async function showRoutesNotice(app: App, variant: string): Promise<void> {
  Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, bestAnte: 3, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
  app.runs.startRun('classic', false, 0, 4242);
  const run = app.run!;
  if (variant.startsWith('a')) {
    // Третья глава, развилок в этом забеге ещё нет: цепочка из трёх ночей
    run.ante = 3;
    run.unlocks.routes = false;
    run.chapter = planChapter(run);
    app.runs.beginNight(0);
    await app.router.route();
    await wait(1200);
    if (variant === 'a2') toast('Открыты Развилки: со следующего забега выбирай путь по карте неба');
    else banner();
    return;
  }
  run.unlocks.routes = true;
  run.chapter = planChapter(run);
  await app.router.route();
  await wait(2600);
  if (variant === 'b') windowScene();
  else coachOnFork();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A1: праздник открытия, как «Новое созвездие!», с двумя значками пути. */
function banner(): void {
  const pair = (kind: 'night' | 'bright', name: string) => h('div.rn-pick', null, [h('span.rn-orb', null, routeIcon(kind)), h('span', null, name)]);
  const el = h('div.discovery.rn-banner', { attrs: { role: 'status', 'aria-live': 'polite' } }, [
    h('div.discovery-kicker', null, 'Открыто'),
    h('div.discovery-name', null, 'Развилки'),
    h('div.rn-pair', null, [pair('night', 'Ночь'), h('span.rn-or', null, 'или'), pair('bright', 'Яркая ночь')]),
    h('div.discovery-desc', null, 'Со следующего забега ты сам выбираешь путь по карте неба'),
  ]);
  el.addEventListener('click', () => el.remove());
  document.getElementById('ui')!.append(el);
}

/** B: окно-сцена на первой карте с развилками, как у Кометы и Телескопа. */
function windowScene(): void {
  const row = (kind: 'night' | 'bright', name: string, desc: string) =>
    h('div.rn-row', null, [h('span.rn-orb', null, routeIcon(kind)), h('div', null, [h('b', null, name), h('span', null, desc)])]);
  const m = sceneWindow({
    className: 'rn-scene',
    label: 'Развилки',
    mid: [
      sceneRibbon('Развилки', 'новое на карте неба'),
      h('div.rn-rows', null, [
        row('night', 'Ночь', 'Обычная цель и награда'),
        row('bright', 'Яркая ночь', 'Цель выше, зато в награду Знамение на выбор'),
      ]),
      h('p.rn-note', null, 'На каждом шаге главы путь выбираешь ты'),
    ],
    acts: [button('Выбрать путь', () => m.close(), { className: 'primary' })],
  });
}

/** C: подсказка «Нить» у двух звёзд первого шага, без затемнения экрана. */
function coachOnFork(): void {
  const stars = [...document.querySelectorAll<HTMLElement>('.sm-star.open')];
  if (!stars.length) return;
  const rects = stars.map((s) => s.getBoundingClientRect());
  const x = Math.min(...rects.map((r) => r.left)) - 14;
  const y = Math.min(...rects.map((r) => r.top)) - 12;
  const w = Math.max(...rects.map((r) => r.right)) - x + 14;
  const hgt = Math.max(...rects.map((r) => r.bottom)) - y + 30;
  const ring = h('div.coach-ring.on', { style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` } });
  const ok = h('button.coach-ok', { type: 'button' }, 'Понятно');
  const el = h('div.coach', { attrs: { role: 'status' } }, [h('div.coach-text', null, [h('b', null, 'Новое: развилка. '), 'Выбери, какой ночью идти дальше: обычной или Яркой, где цель выше и в награду Знамение']), ok]);
  const ui = document.getElementById('ui')!;
  ui.append(ring, el);
  const top = Math.max(70, y - el.offsetHeight - 16);
  Object.assign(el.style, { top: `${top}px`, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', opacity: '1' });
  ok.addEventListener('click', () => (ring.remove(), el.remove()));
}
