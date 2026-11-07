import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/security/csp';

const directives = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));

describe('CSP игры (SEC.8)', () => {
  it('без встроенных скриптов и eval, без плагинов и форм', () => {
    const d = directives(contentSecurityPolicy());
    expect(d['script-src']).toEqual(["'self'", 'https:']);
    expect(d['script-src']).not.toContain("'unsafe-inline'");
    expect(d['script-src']).not.toContain("'unsafe-eval'");
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'none'"]);
    expect(d['connect-src']).not.toContain('ws:');
  });

  it('приложение Android: скрипты только свои, сеть только к своему серверу (APK.6)', () => {
    const d = directives(contentSecurityPolicy(false, 'https://game.denvalclass.ru'));
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['connect-src']).toEqual(["'self'", 'https://game.denvalclass.ru']);
    expect(d['frame-src']).toEqual(["'none'"]);
    expect(d['img-src']).not.toContain('https:');
  });

  it('в разработке открыт ws: для HMR Vite', () => {
    expect(directives(contentSecurityPolicy(true))['connect-src']).toContain('ws:');
  });
});
