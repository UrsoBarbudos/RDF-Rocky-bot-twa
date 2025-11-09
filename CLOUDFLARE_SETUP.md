# Настройка Cloudflare Workers для Rocky Bot

## Зачем нужен Cloudflare Worker?

Cloudflare Worker выступает как прокси между вашим Web App и Airtable, скрывая API токены и обеспечивая безопасность.

## Шаг 1: Создание Worker

1. Перейдите на [workers.cloudflare.com](https://workers.cloudflare.com)
2. Войдите или зарегистрируйтесь
3. Нажмите **"Create a Worker"**
4. Назовите worker: `rocky-bot-api` (или любое другое имя)

## Шаг 2: Код Worker

Скопируйте код из файла `cloudflare-worker.js` в редактор Cloudflare Worker.

⚠️ **ВАЖНО:** Замените в коде:
- `AIRTABLE_TOKEN` — ваш Personal Access Token
- `BASE_ID` — ID вашей базы Airtable
- `TABLE_NAME` — название таблицы

## Шаг 3: Развертывание

1. Нажмите **"Save and Deploy"**
2. Скопируйте URL вашего Worker (например: `https://rocky-bot-api.your-subdomain.workers.dev`)

## Шаг 4: Обновление profile.html

В файле `profile/profile.html` замените:

```javascript
const API_URL = 'https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev';
```

На URL вашего Worker.

## Шаг 5: Тестирование

1. Сделайте commit и push в GitHub
2. Подождите 1-2 минуты для обновления GitHub Pages
3. Откройте бота в Telegram и нажмите кнопку "Мой профиль"

## API Endpoints

### GET /profile?chat_id={id}
Получение данных профиля пользователя

### POST /profile
Сохранение/обновление профиля

Body:
```json
{
  "recordId": "rec123...",  // null для новой записи
  "userData": {
    "chat_id": "123456",
    "@username": "username",
    "Контактный телефон": "+7...",
    "Платежные реквизиты": "...",
    "Примечание": "..."
  }
}
```

## Преимущества

- ✅ API токены скрыты на сервере
- ✅ Бесплатно (100,000 запросов/день)
- ✅ Быстро (edge computing)
- ✅ Безопасно (CORS настроен)
- ✅ Легко масштабируется
