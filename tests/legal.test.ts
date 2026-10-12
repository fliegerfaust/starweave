import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../src/legal/markdown';

describe('юридические тексты', () => {
  it('подставляет оператора и почту, рисует заголовки и списки', () => {
    const html = markdownToHtml('# Заголовок\n\nОператор: {{OPERATOR}}.\n\n- **жирно** раз\n- два', { operator: 'ИП Тест' });
    expect(html).toContain('<h1>Заголовок</h1>');
    expect(html).toContain('ИП Тест');
    expect(html).toContain('<ul><li><strong>жирно</strong> раз</li><li>два</li></ul>');
  });

  it('внутри игры ссылки остаются текстом', () => {
    expect(markdownToHtml('[блокировщик](https://example.com)', {}, false)).toBe('<p>блокировщик</p>');
    expect(markdownToHtml('[блокировщик](https://example.com)')).toContain('href="https://example.com"');
  });

  it.each(['privacy.ru', 'privacy.en', 'terms.ru', 'terms.en'])('%s: все плейсхолдеры известны', (name) => {
    const md = readFileSync(`legal/${name}.md`, 'utf8');
    const keys = [...md.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!.toLowerCase());
    const config = JSON.parse(readFileSync('legal/config.json', 'utf8')) as Record<string, string>;
    for (const key of keys) expect(config[key], key).toBeDefined();
  });
});
