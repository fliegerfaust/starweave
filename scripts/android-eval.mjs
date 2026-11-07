// Выполняет JS в WebView отладочной сборки на телефоне и печатает результат: замеры кадров,
// проверка значений. Запуск: node scripts/android-eval.mjs '<выражение>' или @файл.js
// Телефон выбирается через ANDROID_SERIAL, если подключено несколько устройств.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = 'com.denvalgames.starweave';
const PORT = 9334;

const arg = process.argv[2];
if (!arg) throw new Error("usage: node scripts/android-eval.mjs '<js>' | @file.js");
const expression = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg;

const adb = (...args) => execFileSync(`${homedir()}/Library/Android/sdk/platform-tools/adb`, args, { encoding: 'utf8' });
const pid = adb('shell', 'pidof', APP).trim();
adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
ws.onmessage = (m) => {
  const data = JSON.parse(m.data);
  if (data.id !== 1) return;
  console.log(JSON.stringify(data.result?.result?.value ?? data.result ?? data.error));
  process.exit(0);
};
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
