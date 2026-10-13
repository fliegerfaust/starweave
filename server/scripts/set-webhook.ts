/**
 * Подключить бота к серверу: вебхук с секретом и меню команд. Запуск один раз после
 * того, как в /opt/starweave/.env появились BOT_TOKEN и TG_WEBHOOK_SECRET:
 *
 *   ssh denval 'cd /opt/starweave && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'
 *
 * Вебхук и опрос getUpdates несовместимы: после этого бота можно слушать только сервером.
 */
import { botApi } from '../src/telegram.ts';

const token = process.env.BOT_TOKEN ?? '';
const secret = process.env.TG_WEBHOOK_SECRET ?? '';
const url = process.env.WEBHOOK_URL ?? 'https://game.denvalclass.ru/tg/webhook';
if (!token || secret.length < 16) {
  console.error('Нужны BOT_TOKEN и TG_WEBHOOK_SECRET (от 16 символов).');
  process.exit(1);
}
const bot = botApi(token);
await bot('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'pre_checkout_query'], drop_pending_updates: true });
const commands = {
  ru: [
    { command: 'start', description: 'Играть' },
    { command: 'paysupport', description: 'Помощь с покупками' },
    { command: 'terms', description: 'Условия покупок' },
  ],
  en: [
    { command: 'start', description: 'Play' },
    { command: 'paysupport', description: 'Help with purchases' },
    { command: 'terms', description: 'Purchase terms' },
  ],
};
await bot('setMyCommands', { commands: commands.en });
await bot('setMyCommands', { commands: commands.ru, language_code: 'ru' });
console.log('Вебхук:', JSON.stringify(await bot('getWebhookInfo', {})));
