import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Оболочка Android (эпик APK). Сборка: `npm run build:android`.
 *
 * Адрес WebView (`https://localhost`) менять нельзя: от него зависит `localStorage`,
 * новый адрес оставит игрока без сохранений. Сервер пускает события по этому же адресу.
 */
const config: CapacitorConfig = {
  appId: 'com.denvalgames.starweave',
  appName: 'Звёздное плетение',
  webDir: 'dist-android',
  // Только для замеров на телефоне: `CAP_SERVER_URL=http://localhost:5173 npx cap copy android`
  ...(process.env.CAP_SERVER_URL ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } } : {}),
  android: {
    // Сборка под ES2022: ниже этой версии WebView игра не запустится (APK.5)
    minWebViewVersion: 94,
  },
  plugins: {
    // Отступы приходят переменными `--safe-area-inset-*`: `env()` в WebView ниже 140 врёт (APK.2)
    // `DARK` — светлые значки: фон игры всегда тёмный, тема телефона на него не влияет
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
};

export default config;
