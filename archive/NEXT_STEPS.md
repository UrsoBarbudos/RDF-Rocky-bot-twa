# Что делать дальше: Чек-лист по деплою

## ✅ Готово к деплою:
- `registration/registration.html` - форма регистрации
- `cloudflare-worker-secure.js` - обновлён с endpoints `/registration` и `/registration/approve`
- `bot-callback-handler.js` - Worker для обработки callback кнопок

## 📋 Последовательность действий:

### 1. Обновить Airtable (5 мин)
Открыть таблицу **Whitelist** и добавить поля:
- `Request Date` (Date with time)
- `Approved Date` (Date with time)  
- `Approved By` (Single line text)

### 2. Деплой Workers (3 мин)
```bash
# Обновляем API Worker
wrangler deploy cloudflare-worker-secure.js --name rocky-bot-api

# Деплоим Callback Handler
wrangler deploy bot-callback-handler.js --name rocky-bot-callback

# Добавляем BOT_TOKEN в callback handler
wrangler secret put BOT_TOKEN --name rocky-bot-callback
```

### 3. Настроить Webhook (2 мин)
```bash
# Установить webhook (замените URL на реальный)
curl -X POST "https://api.telegram.org/bot7895419619:AAH7GGUD1jy4gQNWS1IZOw-QOaXmfqYXxjQ/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://rocky-bot-callback.YOUR_ACCOUNT.workers.dev"}'
```

### 4. Загрузить на GitHub Pages (2 мин)
```bash
cd RDF-Rocky-bot-twa
cp ../registration/registration.html ./registration.html
git add registration.html
git commit -m "Add registration page"
git push
```

### 5. Тестирование (5 мин)
1. Создать тестового пользователя (или попросить кого-то)
2. Отправить `/register` боту (вручную или через n8n)
3. Открыть форму регистрации
4. Нажать "Отправить заявку"
5. Проверить, что админ получил уведомление
6. Нажать "✅ Одобрить"
7. Проверить Whitelist в Airtable

### 6. Восстановить свой доступ
После тестирования вернуть свой статус в Whitelist на `Approved` (если был изменён для тестов).

## ⚠️ Важно:
- После установки webhook бот перестанет работать через polling
- Убедитесь, что `BOT_TOKEN` правильно установлен в оба Workers
- Admin Chat ID в коде: `182719187` (ваш)

## 📝 Если нужна помощь:
См. подробную инструкцию в `REGISTRATION_DEPLOY.md`
