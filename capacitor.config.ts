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
  server: {
    // Старый WebView: вместо белого экрана просьба обновить его (APK.5); файл из android-www/
    errorPath: 'webview-old.html',
    // Только для замеров на телефоне: `CAP_SERVER_URL=http://localhost:5173 npx cap copy android`
    ...(process.env.CAP_SERVER_URL ? { url: process.env.CAP_SERVER_URL, cleartext: true } : {}),
  },
  android: {
    // Вёрстка опирается на :has() (105) и dvh (108), код на structuredClone (98) (APK.5)
    minWebViewVersion: 108,
  },
  plugins: {
    // Отступы приходят переменными `--safe-area-inset-*`: `env()` в WebView ниже 140 врёт (APK.2)
    // `DARK` — светлые значки: фон игры всегда тёмный, тема телефона на него не влияет
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
};

export default config;
