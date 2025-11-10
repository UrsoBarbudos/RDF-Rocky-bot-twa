# Инструкция по деплою системы регистрации

## Шаг 1: Настроить автоматическую дату в Airtable

В таблице **Whitelist** настройте поле **Request Date** так, чтобы оно автоматически заполнялось при создании записи:

1. Откройте таблицу Whitelist
2. Найдите или создайте поле `Request Date` (тип: Date with time)
3. В настройках поля включите опцию **"Default to: Current date"**

> **Примечание:** Worker теперь не записывает даты вручную — Airtable делает это автоматически.

## Шаг 2: Задеплоить обновлённый API Worker

```bash
cd /Users/egornikitin/Documents/Production/CODING/Rocky_v2_BOT

# Деплоим обновлённый cloudflare-worker-secure.js
wrangler deploy cloudflare-worker-secure.js --name rocky-bot-api
```

## Шаг 3: Задеплоить Callback Handler Worker

```bash
# Деплоим новый Worker для обработки callback кнопок
wrangler deploy bot-callback-handler.js --name rocky-bot-callback

# Записываем URL нового Worker (будет что-то вроде):
# https://rocky-bot-callback.egordkd.workers.dev
```

## Шаг 4: Настроить переменные окружения для Callback Handler

```bash
# Добавляем BOT_TOKEN в новый Worker
wrangler secret put BOT_TOKEN --name rocky-bot-callback
# Вставить токен бота: 7895419619:AAH7GGUD1jy4gQNWS1IZOw-QOaXmfqYXxjQ
```

## Шаг 5: Установить Webhook для бота

```bash
# Заменить <BOT_TOKEN> на реальный токен и <CALLBACK_URL> на URL из Шага 3
curl -X POST "https://api.telegram.org/bot7895419619:AAH7GGUD1jy4gQNWS1IZOw-QOaXmfqYXxjQ/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://rocky-bot-callback.egordkd.workers.dev"}'

# Проверить установку webhook:
curl "https://api.telegram.org/bot7895419619:AAH7GGUD1jy4gQNWS1IZOw-QOaXmfqYXxjQ/getWebhookInfo"
```

## Шаг 6: Загрузить registration.html на GitHub Pages

```bash
cd RDF-Rocky-bot-twa

# Копируем файл регистрации
cp ../registration/registration.html ./registration.html

# Коммитим и пушим
git add registration.html
git commit -m "Add registration page"
git push origin main

# URL будет: https://ursobarbudos.github.io/RDF-Rocky-bot-twa/registration.html
```

## Шаг 7: Добавить команду /register в бот

Нужно через [@BotFather](https://t.me/BotFather) добавить команду:

1. Отправить `/setcommands` BotFather
2. Выбрать `@Rocky_RDF_Admin_bot`
3. Отправить:
```
start - Запустить бота
profile - Открыть профиль
register - Подать заявку на регистрацию
help - Помощь
```

## Шаг 8: Добавить обработчик команды /register

В вашем боте (если он работает через n8n или другую систему) нужно добавить обработку команды `/register`, которая отправляет Web App кнопку:

```json
{
  "chat_id": "{{$json.message.chat.id}}",
  "text": "📝 Для регистрации откройте форму ниже:",
  "reply_markup": {
    "inline_keyboard": [[
      {
        "text": "📝 Подать заявку",
        "web_app": {
          "url": "https://ursobarbudos.github.io/RDF-Rocky-bot-twa/registration.html"
        }
      }
    ]]
  }
}
```

## Проверка работы

После деплоя протестируйте полный flow:

1. ✅ Отправить боту `/register`
2. ✅ Открыть форму регистрации
3. ✅ Нажать "Отправить заявку"
4. ✅ Вы (админ) получите уведомление с кнопками
5. ✅ Нажать "✅ Одобрить"
6. ✅ Тестовый пользователь получит уведомление об одобрении
7. ✅ В Whitelist появится запись со статусом "Approved"

## Важные моменты

- **Admin Chat ID**: В `cloudflare-worker-secure.js` захардкожен ваш chat_id `182719187` для уведомлений. Если админов несколько, нужно отправлять в массив.
- **Webhook**: После установки webhook бот перестанет отвечать на polling. Если нужно вернуться на polling, выполните: `curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`
- **Безопасность**: Callback handler не проверяет, что запрос пришёл именно от Telegram. Для production рекомендуется добавить проверку `X-Telegram-Bot-Api-Secret-Token`.

## Откат изменений

Если что-то пошло не так:

```bash
# Удалить webhook
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Задеплоить старую версию Worker
wrangler rollback --name rocky-bot-api
```
