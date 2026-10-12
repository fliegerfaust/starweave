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

/** Политика или соглашение прямо в игре — без внешних ссылок (правила порталов). */
export function showLegal(doc: 'privacy' | 'terms'): void {
  const body = h('div.legal');
  body.innerHTML = markdownToHtml(TEXTS[doc][getLang()], config as Record<string, string>, false);
  const m = modal([body, h('div.row.end', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))], { className: 'wide' });
}
