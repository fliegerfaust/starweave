import { getLang, t } from '@/i18n';
import { markdownToHtml } from '@/legal/markdown';
import config from '../../../legal/config.json';
import privacyRu from '../../../legal/privacy.ru.md?raw';
import privacyEn from '../../../legal/privacy.en.md?raw';
import termsRu from '../../../legal/terms.ru.md?raw';
import termsEn from '../../../legal/terms.en.md?raw';
import { h } from '../dom';
import { button, modal } from '../widgets';

const TEXTS = {
  privacy: { ru: privacyRu, en: privacyEn },
  terms: { ru: termsRu, en: termsEn },
};

/**
 * Политика или соглашение прямо в игре — без внешних ссылок (правила порталов). «Табличка»
 * (RD.11): заголовок-табличка, дата редакции, разделы с номером в кольце; текст прокручивается
 * под шапкой, «Назад» внизу по своей ширине.
 */
export function showLegal(doc: 'privacy' | 'terms'): void {
  const html = markdownToHtml(TEXTS[doc][getLang()], config as Record<string, string>, false);
  const title = /<h1>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/ игры «Звёздное плетение»|^Starweave /, '') ?? '';
  const body = h('div.legal-doc');
  body.innerHTML = html.replace(/<h1>.*?<\/h1>\s*<p>(.*?)<\/p>/, '<p class="legal-ed">$1</p>').replace(/<h2>(\d+)\.\s*/g, '<h2><span class="n">$1</span>');
  const m = modal(
    [h('div.legal-scroll', null, body), h('div.legal-foot', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))],
    { title, className: 'legal-win' },
  );
}
