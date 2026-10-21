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

  it('в разработке открыт ws: для HMR Vite', () => {
    expect(directives(contentSecurityPolicy(true))['connect-src']).toContain('ws:');
  });
});
