import { omenSigil } from '@/art/sigil';
import { omenDef } from '@/core/content/omens';
import { named, t } from '@/i18n';
import { bonusLine } from './bonus';
import { canvasImg, dpr, h } from './dom';
import { sceneRibbon } from './scene-window';
import { button } from './widgets';

const MEDAL = 120;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Сцена Резонанса (RS.2): экран гаснет, две медали пары слетаются из своих мест в ряду к
 * центру, сливаются вспышкой, и из неё раскрывается легендарная медаль — с именем лентой,
 * бонусом строкой и кнопкой «Дальше». `from` — медали в ряду Знамений; `fuse` — само
 * слияние в забеге, оно случается, когда медали встретились.
 */
export async function playResonance(a: string, b: string, legend: string, from: [HTMLElement | null, HTMLElement | null], fuse: () => void): Promise<void> {
  const def = omenDef(legend);
  const info = named('omen', legend, def.vars?.(def.initialData?.() ?? {}) ?? {});
  // Место медали и текст — одним блоком по центру: в ландшафте рядом, на телефоне столбиком
  const slot = h('div.res-slot');
  const text = h('div.res-text');
  const layer = h('div.res-scene', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('resonance.title') } }, h('div.res-stack', null, [slot, text]));
  document.getElementById('ui')!.append(layer);
  const target = slot.getBoundingClientRect();
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const fly = (id: string, el: HTMLElement | null, side: -1 | 1) => {
    const r = el?.getBoundingClientRect();
    const m = h('div.res-fly', null, canvasImg(omenSigil(id, 72, dpr()), 72));
    m.style.left = `${r ? r.left + r.width / 2 : cx + side * 80}px`;
    m.style.top = `${r ? r.top + r.height / 2 : cy}px`;
    layer.append(m);
    return m;
  };
  const ma = fly(a, from[0], -1);
  const mb = fly(b, from[1], 1);
  requestAnimationFrame(() => layer.classList.add('on'));
  if (!reduced()) {
    await wait(60);
    // Медали поднимаются к месту легендарной и встают рядом — дрожат, звуча вместе
    for (const [m, side] of [[ma, -1], [mb, 1]] as const) {
      m.style.left = `${cx + side * 46}px`;
      m.style.top = `${cy}px`;
      m.classList.add('up');
    }
    await wait(620);
    layer.classList.add('hum');
    await wait(520);
    // Сходятся в одну точку и гаснут во вспышке
    for (const m of [ma, mb]) {
      m.style.left = `${cx}px`;
      m.classList.add('merge');
    }
    await wait(300);
  }
  fuse();
  ma.remove();
  mb.remove();
  slot.append(h('div.res-burst'), h('div.res-medal', null, canvasImg(omenSigil(legend, MEDAL, dpr()), MEDAL)));
  await wait(reduced() ? 0 : 260);
  let done!: () => void;
  const closed = new Promise<void>((r) => (done = r));
  const go = button(t('resonance.next'), () => {
    layer.classList.add('out');
    window.setTimeout(() => layer.remove(), 220);
    done();
  });
  text.append(
    sceneRibbon(t('resonance.title'), info.name),
    bonusLine(info.desc),
    h('div.res-from', null, [canvasImg(omenSigil(a, 24, dpr()), 24), h('span', null, '+'), canvasImg(omenSigil(b, 24, dpr()), 24), h('span', null, t('resonance.from'))]),
    go,
  );
  layer.classList.add('shown');
  go.focus({ preventScroll: true });
  return closed;
}
