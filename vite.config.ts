import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };
import { contentSecurityPolicy } from './src/security/csp';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      // CSP мета-тегом и в разработке: e2e проверяют, что политика ничего не ломает (SEC.8)
      name: 'starweave-csp',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(command === 'serve') }, injectTo: 'head-prepend' }],
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
