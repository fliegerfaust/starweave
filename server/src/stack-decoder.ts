import { createHash } from 'node:crypto';

/**
 * Скрипт сводки: переводит кадры стека js_error из сборки (`app-X.js:2:23806`) в исходники
 * (`src/game/night/scene.ts:714`). Карты исходников лежат рядом со сборкой на сайте игры
 * (`build.sourcemap`), браузер берёт их оттуда сам — серверу не нужен выход в интернет.
 * Без библиотек: из карты нужен только поиск одной позиции, это ~40 строк разбора VLQ.
 * Стек пришёл от клиента — выводится только через textContent.
 */
const SOURCE = `(() => {
  const site = document.body.dataset.site || '';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const maps = new Map();
  const load = (url) => {
    if (!maps.has(url)) maps.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return maps.get(url);
  };
  const vlq = (seg) => {
    const out = [];
    let value = 0;
    let shift = 0;
    for (const ch of seg) {
      const d = B64.indexOf(ch);
      value += (d & 31) << shift;
      if (d & 32) shift += 5;
      else {
        out.push(value & 1 ? -(value >> 1) : value >> 1);
        value = 0;
        shift = 0;
      }
    }
    return out;
  };
  // Строка и колонка в сборке — с единицы, как в стеке браузера
  const lookup = (map, line, col) => {
    const lines = map.mappings.split(';');
    let src = 0, oLine = 0, oCol = 0, name = 0, best = null;
    for (let i = 0; i < lines.length && i < line; i++) {
      let gCol = 0;
      for (const seg of lines[i].split(',')) {
        if (!seg) continue;
        const v = vlq(seg);
        gCol += v[0];
        if (v.length > 1) { src += v[1]; oLine += v[2]; oCol += v[3]; }
        if (v.length > 4) name += v[4];
        if (i === line - 1) {
          if (gCol > col - 1) break;
          if (v.length > 1) best = { src, oLine, oCol, name: v.length > 4 ? name : -1 };
        }
      }
    }
    if (!best) return null;
    const file = String(map.sources[best.src] || '?').replace(/^(\\.\\.\\/)+/, '').replace(/^webpack:\\/\\/\\/?/, '');
    return { file, line: best.oLine + 1, col: best.oCol + 1, name: best.name >= 0 ? map.names[best.name] : '' };
  };
  for (const pre of document.querySelectorAll('pre[data-stack]')) {
    const frames = pre.textContent.split('\\n');
    pre.textContent = '';
    for (const raw of frames) {
      const row = document.createElement('div');
      row.textContent = raw;
      pre.append(row);
      const m = /^(.*)@(.+):(\\d+):(\\d+)$/.exec(raw);
      if (!m) continue;
      const url = m[2].startsWith('/') ? site + m[2] : m[2];
      if (!site || !url.startsWith(site + '/')) continue;
      load(url + '.map').then((map) => {
        const pos = map && map.mappings ? lookup(map, Number(m[3]), Number(m[4])) : null;
        if (!pos) return;
        row.textContent = (pos.name || m[1]) + ' — ' + pos.file + ':' + pos.line + ':' + pos.col;
        const small = document.createElement('small');
        small.textContent = raw;
        row.append(small);
        row.className = 'decoded';
      });
    }
  }
})();`;

export const STACK_SCRIPT = SOURCE;
/** Хэш для Content-Security-Policy: разрешён ровно этот встроенный скрипт. */
export const STACK_SCRIPT_HASH = `sha256-${createHash('sha256').update(SOURCE).digest('base64')}`;
