import{aO as g,h,m as y,c as f,t as v}from"./app-BdEd18VQ.js";import"./index-DWnDDuyl.js";import"./catalog-B1wsq2pA.js";function w(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}let m=!0;function c(t){return w(t).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g,m?'<a href="$2" target="_blank" rel="noopener">$1</a>':"$1")}function b(t,s={},d=!0){m=d;const r=t.replace(/\{\{(\w+)\}\}/g,(l,e)=>s[e.toLowerCase()]??`{{${e}}}`),a=[];let n=[],o=[];const i=()=>{o.length&&a.push(`<p>${c(o.join(" "))}</p>`),o=[],n.length&&a.push(`<ul>${n.map(l=>`<li>${c(l)}</li>`).join("")}</ul>`),n=[]};for(const l of r.split(`
`)){const e=l.trimEnd(),u=/^(#{1,3})\s+(.*)$/.exec(e);if(u){i();const p=u[1].length;a.push(`<h${p}>${c(u[2])}</h${p}>`)}else/^\s*-\s+/.test(e)?(o.length&&(a.push(`<p>${c(o.join(" "))}</p>`),o=[]),n.push(e.replace(/^\s*-\s+/,""))):/^\s{2,}\S/.test(e)&&n.length?n[n.length-1]+=` ${e.trim()}`:e.trim()===""?i():(n.length&&i(),o.push(e.trim()))}return i(),a.join(`
`)}const T="Безик Денис Валерьевич, плательщик налога на профессиональный доход (самозанятый), ИНН 230910405420",k="Denis Valerievich Bezik, self-employed (professional income tax payer, Russia), INN 230910405420",S="denis.bezik@gmail.com",G={operator:T,operator_en:k,email:S},A=`# Политика конфиденциальности игры «Звёздное плетение»

Редакция от 12 октября 2026 года.

Эта политика объясняет, какие данные обрабатываются, когда вы играете в «Звёздное
плетение» (Starweave, далее — «Игра»), зачем и как вы можете ими управлять.

## 1. Кто отвечает за данные

Оператор: {{OPERATOR}}. Связь по вопросам данных: {{EMAIL}}.

## 2. Что мы не собираем

Игра не требует регистрации. Мы не просим и не храним ваше имя, телефон, адрес электронной
почты, платёжные данные или фотографии.

## 3. Какие данные обрабатываются

- **Прогресс и настройки** — текущий забег, статистика, открытые колоды, громкость, язык.
  Хранятся на вашем устройстве. Если вы играете на площадке с облачными сохранениями
  (например, Яндекс Игры или Telegram), копия хранится у площадки и привязана к вашему
  аккаунту на ней.
- **Обезличенная статистика игры** — события вида «пройден шаг обучения», «ночь
  проиграна на третьем созвездии», «куплено Знамение», а также тип устройства, размер экрана,
  язык, частота кадров и технические ошибки. Собирается нашим сервером в Москве (Россия) —
  со случайным номером устройства, без имён, контактов и IP-адресов. Может также собираться
  сервисом Яндекс Метрика (ООО «Яндекс») с помощью cookie и идентификаторов устройства.
- **Реклама** — если Игра показывает рекламу, её показывает рекламная сеть площадки
  (например, Рекламная сеть Яндекса). Сеть может использовать идентификаторы устройства и
  cookie по своим правилам.
- **Покупки** — проводятся площадкой (Telegram, Яндекс Игры, App Store, Google Play, RuStore).
  Мы получаем только подтверждение покупки, без ваших платёжных данных. Для покупок в Telegram
  наш сервер хранит числовой идентификатор вашего аккаунта Telegram, купленный товар, сумму в
  Stars, дату и номер платежа — чтобы покупка открывалась на любом вашем устройстве и её можно
  было вернуть.
- **Обращения в поддержку** — если вы пишете боту игры, сообщение вместе с идентификатором и
  именем пользователя Telegram пересылается автору игры в Telegram, чтобы ответить вам.

## 4. Зачем

- чтобы сохранять ваш прогресс;
- чтобы понимать, где игра непонятна или слишком сложна, и улучшать её;
- чтобы находить и исправлять ошибки;
- чтобы показывать рекламу и проводить покупки — это позволяет Игре оставаться бесплатной.

Мы не продаём данные и не используем их для решений, которые юридически затрагивают вас.

## 5. Сроки хранения

Данные на устройстве хранятся, пока вы их не удалите. Записи о покупках хранятся, пока
действует покупка, и по требованиям закона об учёте доходов. Статистика на нашем сервере — 400 дней,
статистика Метрики — в сроки, установленные Яндексом. Облачные сохранения — по правилам площадки.

## 6. Как управлять данными

- **Удалить прогресс:** «Настройки → Сбросить прогресс» — удаляет данные на устройстве,
  облачное сохранение Игры и случайный номер устройства (новая статистика с ним не связана).
- **Отключить сбор статистики:** заблокировать cookie в браузере или воспользоваться
  [блокировщиком Метрики](https://yandex.ru/support/metrica/general/opt-out.html).
- **Персонализация рекламы** отключается в настройках вашего устройства или аккаунта площадки.
- По любым вопросам, включая доступ, исправление или удаление данных, пишите на {{EMAIL}}.

## 7. Дети

Игра подходит для любого возраста и не собирает намеренно персональные данные детей.
Если вы считаете, что ребёнок передал нам такие данные, напишите нам — мы их удалим.

## 8. Изменения

Мы можем обновлять эту политику. Дата актуальной редакции указана в начале документа.
`,E=`# Starweave Privacy Policy

Effective date: October 12, 2026.

This policy explains what data is processed when you play Starweave (the "Game"), why, and how
you can control it.

## 1. Who is responsible

Operator: {{OPERATOR_EN}}. Contact for data questions: {{EMAIL}}.

## 2. What we do not collect

The Game requires no registration. We do not ask for or store your name, phone number, email
address, payment details or photos.

## 3. What data is processed

- **Progress and settings** — your current run, stats, unlocked decks, volume, language. Stored
  on your device. If you play on a platform with cloud saves (e.g. Yandex Games or Telegram), a
  copy is stored by the platform and linked to your account there.
- **Anonymous gameplay statistics** — events such as "tutorial step completed", "night lost on
  constellation 3", "Omen bought", plus device type, screen size, language, frame rate and
  technical errors. Collected by our server in Moscow (Russia) with a random device number — no
  names, contacts or IP addresses. May also be collected by Yandex Metrica (Yandex LLC) using
  cookies and device identifiers.
- **Advertising** — if the Game shows ads, they are served by the platform's ad network (e.g.
  Yandex Advertising Network), which may use device identifiers and cookies under its own rules.
- **Purchases** — processed by the platform (Telegram, Yandex Games, App Store, Google Play, RuStore).
  We only receive a purchase confirmation, never your payment details. For Telegram purchases our
  server keeps your numeric Telegram account ID, the item, the amount in Stars, the date and the
  payment number — so the purchase unlocks on any of your devices and can be refunded.
- **Support requests** — if you message the game's bot, the message with your Telegram ID and
  username is forwarded to the game's author in Telegram so they can reply.

## 4. Why

- to save your progress;
- to understand where the Game is confusing or too hard and improve it;
- to find and fix bugs;
- to show ads and process purchases, which keeps the Game free.

We do not sell data or use it for decisions that legally affect you.

## 5. Retention

Data on your device is kept until you delete it. Purchase records are kept while the purchase is
in effect and as required by income accounting law. Statistics on our server are kept for 400 days,
Metrica statistics for the periods set by Yandex. Cloud saves follow the platform's rules.

## 6. Your choices

- **Delete progress:** Settings → Reset progress — removes the data on your device, the Game's
  cloud save and the random device number (new statistics are not linked to it).
- **Opt out of statistics:** block cookies in your browser or use the
  [Metrica opt-out](https://yandex.com/support/metrica/general/opt-out.html).
- **Ad personalization** can be turned off in your device or platform account settings.
- For any request, including access, correction or deletion, email {{EMAIL}}.

## 7. Children

The Game is suitable for all ages and does not knowingly collect personal data from children.
If you believe a child has sent us such data, contact us and we will delete it.

## 8. Changes

We may update this policy. The effective date is shown at the top.
`,x=`# Пользовательское соглашение игры «Звёздное плетение»

Редакция от 12 октября 2026 года.

## 1. Общее

«Звёздное плетение» (Starweave, далее — «Игра») предоставляет {{OPERATOR}} («мы»). Играя, вы
соглашаетесь с этими условиями. Если вы не согласны — не используйте Игру.

## 2. Игра

Игра бесплатна. Она может показывать рекламу и предлагать необязательные покупки. Внутриигровые
ценности (золото, Знамения, косметика и т.п.) не являются деньгами, не обмениваются на них и
не передаются другим игрокам.

## 3. Покупки

Покупки проводит площадка, на которой вы играете (в Telegram — за Telegram Stars), по своим
правилам. «Звёздный атлас», набор мецената и внешний вид открываются навсегда и действуют в той
версии Игры, где были куплены. Чаевые ничего не открывают. Ничто из продаваемого не даёт
преимущества в рекордах и вызове дня.

Если купленное не открылось, напишите боту игры команду /paysupport — мы разберёмся и при
необходимости вернём оплату. При возврате покупка перестаёт действовать.

## 4. Честная игра

Запрещено вмешиваться в работу Игры, подделывать результаты рейтингов и вызова дня,
использовать уязвимости. Мы можем исключать такие результаты из рейтингов.

## 5. Права

Игра, её код, графика, звук и тексты принадлежат нам. Вы можете играть в Игру для личного
некоммерческого использования.

## 6. Ответственность

Игра предоставляется «как есть». Мы стараемся, чтобы она работала без ошибок, но не
гарантируем этого и не отвечаем за потерю прогресса из-за сбоев устройства или площадки.

## 7. Изменения и связь

Мы можем обновлять Игру и эти условия. Вопросы: {{EMAIL}}.
`,I=`# Starweave Terms of Use

Effective date: October 12, 2026.

## 1. General

Starweave (the "Game") is provided by {{OPERATOR_EN}} ("we"). By playing you agree to these terms.
If you do not agree, do not use the Game.

## 2. The Game

The Game is free. It may show ads and offer optional purchases. In-game items (gold, Omens,
cosmetics, etc.) are not money, cannot be exchanged for money and cannot be transferred to
other players.

## 3. Purchases

Purchases are processed by the platform you play on (Telegram Stars in Telegram), under its
rules. The Star Atlas, the Patron Pack and cosmetics unlock forever in the version of the Game
where they were bought. Tips unlock nothing. Nothing on sale gives an advantage in records or the
daily challenge.

If a purchase did not unlock, send /paysupport to the game's bot — we will sort it out and refund
if needed. A refunded purchase stops working.

## 4. Fair play

Do not tamper with the Game, fake leaderboard or daily challenge results, or exploit bugs. We may
remove such results from leaderboards.

## 5. Rights

The Game, its code, art, sound and texts belong to us. You may play it for personal,
non-commercial use.

## 6. Liability

The Game is provided "as is". We try to keep it bug-free but do not guarantee it and are not liable
for lost progress caused by device or platform failures.

## 7. Changes and contact

We may update the Game and these terms. Questions: {{EMAIL}}.
`,P={privacy:{ru:A,en:E},terms:{ru:x,en:I}};function L(t){const s=b(P[t][g()],G,!1),d=/<h1>(.*?)<\/h1>/.exec(s)?.[1]?.replace(/ игры «Звёздное плетение»|^Starweave /,"")??"",r=h("div.legal-doc");r.innerHTML=s.replace(/<h1>.*?<\/h1>\s*<p>(.*?)<\/p>/,'<p class="legal-ed">$1</p>').replace(/<h2>(\d+)\.\s*/g,'<h2><span class="n">$1</span>');const a=y([h("div.legal-scroll",null,r),h("div.legal-foot",null,f(v("menu.back"),()=>a.close(),{variant:"secondary"}))],{title:d,className:"legal-win"})}export{L as showLegal};
//# sourceMappingURL=legal-Brdhje0z.js.map
