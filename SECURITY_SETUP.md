# 🔐 Настройка системы безопасности

## Обзор

Этот проект использует многоуровневую систему защиты для контроля доступа к Telegram Web App:

1. **Проверка Telegram initData** - Валидация цифровой подписи от Telegram
2. **Whitelist пользователей** - Контроль списка разрешенных пользователей
3. **Rate Limiting** - Защита от спама и DDoS атак

---

## 📋 Шаг 1: Создание таблицы Whitelist в Airtable

### 1.1. Откройте вашу базу в Airtable

Перейдите в базу: `appCukWqzOVvwnB75`

### 1.2. Создайте новую таблицу

1. Нажмите `+` или `Add or import` → `Create empty table`
2. Назовите таблицу: **`Whitelist`**

### 1.3. Настройте поля таблицы

Создайте следующие поля (столбцы):

| Имя поля | Тип поля | Настройки |
|----------|----------|-----------|
| `chat_id` | **Number** | Integer, Allow negative numbers: No |
| `@username` | **Single line text** | - |
| `Status` | **Single select** | Options: `Pending`, `Approved`, `Blocked` |
| `Added Date` | **Created time** | Date format: Local |
| `Last Modified` | **Last modified time** | Date format: Local |
| `Notes` | **Long text** | Optional: Заметки администратора |

### 1.4. Добавьте себя в whitelist

Создайте первую запись:

```
chat_id: 182719187
@username: urso_barbudos
Status: Approved
```

### 1.5. Создайте View для удобства

Создайте несколько представлений (Views):

- **All Users** - Все пользователи
- **Pending Approval** - Фильтр: `Status = Pending`
- **Approved Users** - Фильтр: `Status = Approved`
- **Blocked Users** - Фильтр: `Status = Blocked`

---

## ⚙️ Шаг 2: Обновление Cloudflare Worker

### 2.1. Получите токен бота

1. Откройте Telegram и найдите [@BotFather](https://t.me/BotFather)
2. Отправьте команду `/token`
3. Выберите вашего бота: `Rocky_RDF_Admin`
4. Скопируйте токен (формат: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2.2. Настройте переменные окружения в Cloudflare

Перейдите в [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)

1. Откройте ваш Worker: `rocky-bot-api`
2. Перейдите в `Settings` → `Variables`
3. Добавьте переменные окружения:

```
AIRTABLE_TOKEN = YOUR_AIRTABLE_TOKEN_HERE
BASE_ID = YOUR_BASE_ID_HERE
BOT_TOKEN = YOUR_BOT_TOKEN_FROM_BOTFATHER
```

⚠️ **Важно**: Отметьте галочку `Encrypt` для всех секретных переменных!

### 2.3. Деплой обновленного Worker

1. Откройте файл `cloudflare-worker.js` в вашем проекте
2. Скопируйте весь код
3. Перейдите в Cloudflare Workers Dashboard → `rocky-bot-api` → `Quick Edit`
4. Вставьте новый код
5. Нажмите `Save and Deploy`

---

## 🗄️ Шаг 3: Настройка Rate Limiting (Опционально)

Rate Limiting использует Cloudflare Workers KV для хранения счетчиков запросов.

### 3.1. Создайте KV Namespace

1. В [Cloudflare Dashboard](https://dash.cloudflare.com/) перейдите в `Workers & Pages` → `KV`
2. Нажмите `Create namespace`
3. Имя: `RATE_LIMIT_KV`
4. Нажмите `Add`

### 3.2. Привяжите KV к Worker

1. Откройте ваш Worker: `rocky-bot-api`
2. Перейдите в `Settings` → `Variables` → `KV Namespace Bindings`
3. Нажмите `Add binding`
   - Variable name: `RATE_LIMIT_KV`
   - KV namespace: Выберите созданный `RATE_LIMIT_KV`
4. Сохраните изменения

### 3.3. Настройка лимитов

По умолчанию установлено:
- **30 запросов в минуту** на один `chat_id`

Чтобы изменить, отредактируйте в `cloudflare-worker.js`:

```javascript
const maxRequests = 30; // Измените это значение
```

---

## 📤 Шаг 4: Деплой обновленного profile.html

### 4.1. Закоммитьте изменения

```bash
git add profile/profile.html cloudflare-worker.js
git commit -m "Add security: initData validation, whitelist, rate limiting"
git push origin main
```

### 4.2. Подождите обновления GitHub Pages

GitHub Pages обновляется автоматически через 1-2 минуты после push.

---

## 🧪 Шаг 5: Тестирование системы безопасности

### 5.1. Тест: Авторизованный пользователь

1. Откройте бота в Telegram
2. Нажмите кнопку "Мой профиль"
3. Профиль должен загрузиться успешно ✅

### 5.2. Тест: Неавторизованный пользователь

1. Удалите вашу запись из таблицы `Whitelist` (или измените Status на `Pending`)
2. Попробуйте открыть профиль
3. Должна появиться ошибка: `"Your access request is pending approval"` ✅

### 5.3. Тест: Прямой доступ к Worker без initData

Выполните в терминале:

```bash
curl -X GET "https://rocky-bot-api.egordkd.workers.dev/profile?chat_id=182719187"
```

**Ожидаемый результат:**
```json
{
  "error": "Unauthorized",
  "message": "Missing Telegram authentication data"
}
```

✅ Worker отклоняет запросы без Telegram initData!

### 5.4. Тест: Rate Limiting

Выполните в терминале (отправьте 35+ запросов подряд через бота):

```bash
for i in {1..35}; do
  echo "Request $i"
  # Откройте профиль в боте 35 раз подряд
done
```

После 30 запросов должна появиться ошибка:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

---

## 🛡️ Как работает защита

### Уровень 1: Проверка Telegram initData

```
Telegram отправляет initData с цифровой подписью
         ↓
Cloudflare Worker проверяет подпись через HMAC-SHA256
         ↓
Если подпись неверна → 401 Unauthorized
```

**Защищает от:**
- Подделки `chat_id` в запросах
- Прямого доступа к API из браузера
- Атак через Postman/curl

### Уровень 2: Whitelist

```
Worker получает chat_id из проверенного initData
         ↓
Проверяет наличие в таблице Whitelist
         ↓
Проверяет Status = "Approved"
         ↓
Если нет или Status != Approved → 403 Access Denied
```

**Защищает от:**
- Доступа неавторизованных пользователей
- Массовой регистрации ботов
- Доступа заблокированных пользователей

### Уровень 3: Rate Limiting

```
Worker сохраняет счетчик запросов в KV
         ↓
Проверяет: count > 30 за последнюю минуту?
         ↓
Если да → 429 Too Many Requests
```

**Защищает от:**
- DDoS атак
- Спама запросами
- Перерасхода квоты Airtable API

---

## 🚨 Обработка инцидентов

### Сценарий: Пользователь сообщает "Access Denied"

1. Откройте таблицу `Whitelist` в Airtable
2. Найдите запись пользователя по `chat_id` или `@username`
3. Проверьте поле `Status`:
   - `Pending` → Измените на `Approved`
   - `Blocked` → Решите, стоит ли разблокировать
   - Записи нет → Создайте новую с `Status = Approved`

### Сценарий: Подозрительная активность

1. Откройте Cloudflare Worker → `Logs` → `Real-time logs`
2. Найдите записи с ошибками `401` или `429`
3. Проверьте `chat_id` подозрительного пользователя
4. Если нужно, измените Status на `Blocked` в Whitelist

### Сценарий: Превышена квота Airtable

Airtable бесплатный план: **1,000 записей / месяц**

Если превышена:
1. Увеличьте строгость Rate Limiting (снизьте `maxRequests`)
2. Добавьте кэширование в Worker (Cloudflare KV)
3. Рассмотрите платный план Airtable

---

## 📊 Мониторинг

### Cloudflare Analytics

1. Откройте Worker → `Metrics`
2. Отслеживайте:
   - **Requests** - Общее количество запросов
   - **Errors** - Количество ошибок (401, 403, 429)
   - **Duration** - Время ответа

### Airtable Records

Следите за количеством записей в таблице `Whitelist`:
- Регулярно очищайте старые `Pending` записи
- Проверяйте аномальный рост количества пользователей

---

## ✅ Чеклист безопасности

- [ ] Таблица `Whitelist` создана с полями: chat_id, @username, Status
- [ ] Вы добавлены в Whitelist со статусом `Approved`
- [ ] Токен бота добавлен в переменные окружения Cloudflare
- [ ] Переменные окружения отмечены как `Encrypt`
- [ ] Обновленный Worker задеплоен
- [ ] `profile.html` отправляет заголовок `X-Telegram-Init-Data`
- [ ] GitHub Pages обновлен (прошло 2+ минуты после push)
- [ ] KV Namespace создан и привязан к Worker (для Rate Limiting)
- [ ] Протестирован доступ через бота (успешно)
- [ ] Протестирован доступ без initData (отклонен)

---

## 🔗 Полезные ссылки

- [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
- [Airtable Base](https://airtable.com/appCukWqzOVvwnB75)
- [Telegram Bot API Documentation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [GitHub Repository](https://github.com/UrsoBarbudos/RDF-Rocky-bot-twa)

---

## 📞 Поддержка

Если возникли вопросы по настройке безопасности, проверьте:
1. Логи Cloudflare Worker (Real-time logs)
2. Консоль браузера (Developer Tools → Console) при открытии Web App
3. Таблицу Whitelist в Airtable

Все компоненты настроены и готовы к использованию! 🎉
