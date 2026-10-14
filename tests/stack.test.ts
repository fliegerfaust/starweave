import { describe, expect, it } from 'vitest';
import { compactStack, STACK_CHARS, STACK_FRAMES } from '../src/analytics/stack';

const SITE = 'https://fliegerfaust.github.io';

describe('стек для js_error', () => {
  it('Chrome: кадры с функцией и без, адрес своего сайта отрезан', () => {
    const stack = [
      'Error: У сущности 615 нет Transform',
      `    at World.req (${SITE}/starweave/assets/app-BcD8qYlD.js:2:23806)`,
      `    at ${SITE}/starweave/assets/night-X.js:1:4410`,
      '    at https://telegram.org/js/telegram-web-app.js:5:10',
      '    at <anonymous>',
    ].join('\n');
    expect(compactStack(stack, SITE)).toBe(
      [
        'World.req@/starweave/assets/app-BcD8qYlD.js:2:23806',
        '?@/starweave/assets/night-X.js:1:4410',
        '?@https://telegram.org/js/telegram-web-app.js:5:10',
      ].join('\n'),
    );
  });

  it('Safari и Firefox: «функция@адрес:строка:колонка»', () => {
    const stack = `req@${SITE}/starweave/assets/app.js:2:23806\nonMove@${SITE}/starweave/assets/night.js:1:99\n@${SITE}/starweave/assets/app.js:2:5\n[native code]`;
    expect(compactStack(stack, SITE)).toBe('req@/starweave/assets/app.js:2:23806\nonMove@/starweave/assets/night.js:1:99\n?@/starweave/assets/app.js:2:5');
  });

  it('не больше кадров и символов, чем принимает сервер; пусто без стека', () => {
    const long = Array.from({ length: 40 }, (_, i) => `    at f${i} (${SITE}/${'x'.repeat(200)}.js:1:${i})`).join('\n');
    const out = compactStack(long, SITE);
    expect(out.split('\n').length).toBeLessThanOrEqual(STACK_FRAMES);
    expect(out.length).toBeLessThanOrEqual(STACK_CHARS);
    expect(compactStack(undefined, SITE)).toBe('');
    expect(compactStack('just a message', SITE)).toBe('');
  });
});
