import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };
import { contentSecurityPolicy } from './src/security/csp';

/** Свой сервер приложения Android: туда и только туда ходят запросы (APK.6). */
const appServer = () => (process.env.VITE_PLATFORM === 'android' && process.env.VITE_EVENTS_URL ? new URL(process.env.VITE_EVENTS_URL).origin : undefined);

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      // CSP мета-тегом и в разработке: e2e проверяют, что политика ничего не ломает (SEC.8)
      name: 'starweave-csp',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(command === 'serve', appServer()) }, injectTo: 'head-prepend' }],
    },
    {
      // Заставка Android прямо в странице: поток занят загрузкой, из кода она появилась бы поздно (APK.11)
      name: 'starweave-boot-cover',
      transformIndexHtml: () => process.env.VITE_PLATFORM === 'android'
        ? [{ tag: 'div', attrs: { class: 'boot-cover' }, children: [{ tag: 'h1', children: 'Звёздное плетение' }], injectTo: 'body-prepend' }]
        : [],
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
