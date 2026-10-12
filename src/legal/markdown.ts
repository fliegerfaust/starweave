/**
 * Минимальный перевод Markdown в HTML для юридических текстов: заголовки, абзацы,
 * списки, **жирный** и [ссылки](url). Без зависимостей — этот же файл запускает
 * Node при генерации публичных страниц.
 */

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let allowLinks = true;

function inline(text: string): string {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, allowLinks ? '<a href="$2" target="_blank" rel="noopener">$1</a>' : '$1');
}

/**
 * `links: false` — ссылки остаются текстом: внутри игры внешние переходы запрещены
 * правилами порталов (Яндекс Игры), на публичной странице они нужны.
 */
export function markdownToHtml(md: string, vars: Record<string, string> = {}, links = true): string {
  allowLinks = links;
  const filled = md.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key.toLowerCase()] ?? `{{${key}}}`);
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of filled.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (/^\s*-\s+/.test(line)) {
      if (para.length) {
        out.push(`<p>${inline(para.join(' '))}</p>`);
        para = [];
      }
      list.push(line.replace(/^\s*-\s+/, ''));
    } else if (/^\s{2,}\S/.test(line) && list.length) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      flush();
    } else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}
