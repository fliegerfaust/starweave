import { defineConfig, devices } from '@playwright/test';

/**
 * Проверка на эмуляциях устройств: вёрстка без наложений и выходов за экран,
 * отсутствие ошибок, FPS на замедленном процессоре. Запуск: `npm run e2e`.
 * Снимки экранов складываются в e2e-results/ — их же можно брать для витрин.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results/artifacts',
  timeout: 90_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4180', trace: 'off' },
  webServer: {
    command: 'npx vite --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: true,
    // Блок AdsGram для проверки рекламы в Telegram (скрипт AdsGram тест подменяет)
    // Проверки написаны на старое поведение; новое (CQ) тесты включают сами через `?ff=`
    env: { VITE_ADSGRAM_BLOCK_ID: 'e2e', VITE_ADSGRAM_INTER_ID: 'int-e2e', VITE_FF: 'none' },
  },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'iphone-x', use: { ...devices['iPhone X'], browserName: 'webkit' } },
    { name: 'iphone-15', use: { ...devices['iPhone 15 Pro Max'], browserName: 'webkit' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'galaxy-a', use: { ...devices['Galaxy S9+'], channel: 'chrome' } },
    { name: 'ipad-mini', use: { ...devices['iPad Mini'], browserName: 'webkit' } },
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 768 }, channel: 'chrome' } },
    // Окно Пикабу Игр на ПК (фрейм страницы игры): широкое и низкое — своя раскладка между ПК и телефоном боком
    { name: 'pikabu-desktop', use: { viewport: { width: 1394, height: 580 }, channel: 'chrome' } },
    { name: 'pikabu-laptop', use: { viewport: { width: 1180, height: 540 }, channel: 'chrome' } },
    // Живое окно Пикабу на ПК по снимку Дениса 29.10: выше 600 — раскладка ПК
    { name: 'pikabu-real', use: { viewport: { width: 1392, height: 633 }, channel: 'chrome' } },
  ],
});
