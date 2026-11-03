/**
 * Перенос правок текстов обучения с сервера в словари репозитория (TX.5): к каждому релизу
 * тексты Дениса и переводы становятся текстами по умолчанию в сборке. Меняется только
 * строковый литерал нужного ключа внутри своего раздела; комментарии и порядок остаются.
 */

/** Литерал строки в стиле словаря: одинарные кавычки, неразрывные пробелы — как ` `. */
export function literal(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/ /g, '\\u00a0')}'`;
}

/**
 * Заменяет значение `раздел.имя` (или `раздел.имя.N` в списке) в исходнике словаря.
 * Возвращает новый исходник или `null`, если ключ не найден в ожидаемом виде.
 */
export function foldText(source: string, key: string, value: string): string | null {
  const [group, name, index] = key.split('.');
  if (!group || !name) return null;
  const start = source.search(new RegExp(`\\n  ${group}: \\{`));
  if (start < 0) return null;
  // Раздел кончается строкой «  },» на том же отступе; однострочный — первой «}»
  const firstLine = source.indexOf('\n', start + 1);
  const oneLine = source.slice(start, firstLine).includes('}');
  const end = oneLine ? firstLine : source.indexOf('\n  },', start);
  if (end < 0) return null;
  const section = source.slice(start, end);
  const str = String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`;
  const re = index === undefined
    ? new RegExp(`(\\b${name}: )${str}`)
    : new RegExp(`(\\b${name}: \\[)((?:\\s*${str},?){${Number(index) + 1}})`);
  const m = re.exec(section);
  if (!m) return null;
  let replaced: string;
  if (index === undefined) replaced = section.replace(re, (_, head: string) => head + literal(value));
  else {
    const items = [...m[2]!.matchAll(new RegExp(str, 'g'))];
    const last = items[Number(index)]!;
    const at = m.index + m[1]!.length + last.index;
    replaced = section.slice(0, at) + literal(value) + section.slice(at + last[0].length);
  }
  return source.slice(0, start) + replaced + source.slice(end);
}
