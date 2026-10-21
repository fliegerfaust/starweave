// Виртуальное время для покадровой записи роликов (`npm run clips`).
// Внедряется в страницу до её скриптов (Playwright addInitScript). Время стоит, пока
// сценарий записи не сдвинет его: `await __vt.step(1000 / 60)`. Так каждый кадр ролика —
// ровно 1/60 секунды игры, сколько бы ни длился снимок экрана.
(() => {
  const realSetTimeout = window.setTimeout.bind(window);
  const startDate = Date.now();
  let now = 0; // мс от загрузки страницы
  let nextId = 1;
  /** @type {{ id: number, cb: FrameRequestCallback }[]} */
  let frames = [];
  /** @type {Map<number, { at: number, every: number, cb: Function, args: unknown[] }>} */
  const timers = new Map();
  /** Когда анимация впервые попалась на глаза — от этого момента идёт её время. */
  const born = new WeakMap();

  performance.now = () => now;
  Date.now = () => startDate + now;

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    frames.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames = frames.filter((f) => f.id !== id);
  };
  const addTimer = (cb, ms, args, repeat) => {
    const id = nextId++;
    const delay = Math.max(0, Number(ms) || 0);
    if (typeof cb === 'function') timers.set(id, { at: now + delay, every: repeat ? Math.max(1, delay) : 0, cb, args });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => addTimer(cb, ms, args, false);
  window.setInterval = (cb, ms, ...args) => addTimer(cb, ms, args, true);
  window.clearTimeout = (id) => void timers.delete(id);
  window.clearInterval = (id) => void timers.delete(id);

  /** Настоящая макрозадача: успевают промисы, динамические импорты и шрифты. */
  const yieldReal = () => new Promise((r) => realSetTimeout(r, 0));

  /** CSS-анимации и Web Animations: пауза и ручное время от момента появления. */
  const syncAnimations = () => {
    for (const anim of document.getAnimations()) {
      if (anim.playState === 'finished') continue;
      if (!born.has(anim)) {
        born.set(anim, now);
        anim.pause();
      }
      const t = now - born.get(anim);
      const end = anim.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end) && t >= end) {
        try {
          anim.finish(); // resolve finished, animationend / transitionend
        } catch {
          anim.cancel();
        }
      } else anim.currentTime = t;
    }
  };

  window.__vt = {
    get now() {
      return now;
    },
    /** Сдвинуть время на `ms`: таймеры по порядку, затем один кадр отрисовки. */
    async step(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 10000; guard++) {
        let due = null;
        let dueId = 0;
        for (const [id, t] of timers) {
          if (t.at <= target && (!due || t.at < due.at)) {
            due = t;
            dueId = id;
          }
        }
        if (!due) break;
        now = Math.max(now, due.at);
        if (due.every) due.at += due.every;
        else timers.delete(dueId);
        try {
          due.cb(...due.args);
        } catch (e) {
          console.error(e);
        }
        await yieldReal();
      }
      now = target;
      const batch = frames;
      frames = [];
      for (const f of batch) {
        try {
          f.cb(now);
        } catch (e) {
          console.error(e);
        }
      }
      syncAnimations();
      await yieldReal();
    },
  };
})();
