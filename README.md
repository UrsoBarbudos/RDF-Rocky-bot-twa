# 🎬 Rocky RDF Bot - Telegram Web App

# Rocky RDF Bot - Telegram Web App

Telegram бот с Web Apps для управления съемочной командой RDF.

> 📖 **Новичок в проекте?** Начните с **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)** — навигатора по всей документации!

## 📋 Описание проекта

Rocky RDF Bot — это комплексное решение для координации съемочной команды, которое включает:

- **Профиль пользователя** — управление контактными данными и платежными реквизитами
- **Интерактивный вызывной лист** — просмотр деталей смен, локаций, расписания
- **Форма обратной связи** — сбор отзывов о прошедших сменах
- **Админ-панель** — утверждение расходов и управление командой

## 🏗️ Архитектура

```
┌─────────────────┐
│  Telegram Bot   │
│   (Menu Button) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐         ┌──────────────────┐
│  GitHub Pages   │────────▶│ Cloudflare Worker│
│  (Web Apps)     │         │   (API Proxy)    │
└─────────────────┘         └────────┬─────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │    Airtable     │
                            │   (Database)    │
                            └─────────────────┘
```

### Компоненты:

1. **Telegram Bot** — интерфейс взаимодействия с пользователями
2. **GitHub Pages** — хостинг для HTML веб-приложений
3. **Cloudflare Workers** — serverless API для безопасной работы с Airtable
4. **Airtable** — база данных для хранения профилей, вызывных, расходов

## 🚀 Быстрый старт

### Предварительные требования

- Аккаунт GitHub
- Telegram Bot Token (получить у [@BotFather](https://t.me/BotFather))
- Аккаунт Airtable с настроенной базой данных
- Аккаунт Cloudflare Workers (бесплатный plan)

### 1. Клонирование репозитория

```bash
git clone https://github.com/UrsoBarbudos/RDF-Rocky-bot-twa.git
cd RDF-Rocky-bot-twa
```

### 2. Настройка Airtable

1. Создайте базу данных в [Airtable](https://airtable.com)
2. Создайте таблицу **"Пользователи"** с полями:
   - `chat_id` (Number)
   - `@username` (Single line text)
   - `Контактный телефон` (Phone number)
   - `Платежные реквизиты` (Long text)
   - `Примечание` (Long text)
   - `Role` (Single select: USER, ADMIN)
3. Создайте Personal Access Token:
   - Перейдите на [airtable.com/create/tokens](https://airtable.com/create/tokens)
   - Дайте токену права: `data.records:read`, `data.records:write`
   - Сохраните токен!

### 3. Настройка Cloudflare Worker

Следуйте инструкциям в [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md):

1. Создайте Worker на [workers.cloudflare.com](https://workers.cloudflare.com)
2. Скопируйте код из `cloudflare-worker.js`
3. Замените учетные данные:
   ```javascript
   const AIRTABLE_TOKEN = 'ваш_токен';
   const BASE_ID = 'ваш_base_id';
   const TABLE_NAME = 'Пользователи';
   ```
4. Разверните Worker и скопируйте URL

### 4. Настройка GitHub Pages

1. Перейдите в `Settings` → `Pages`
2. Выберите ветку `main` и папку `/root`
3. Нажмите `Save`
4. Ваш сайт будет доступен по адресу: `https://username.github.io/RDF-Rocky-bot-twa/`

### 5. Обновление конфигурации

В файле `profile/profile.html` (строка 9) замените:

```javascript
const API_URL = 'https://your-worker-name.your-subdomain.workers.dev';
```

На URL вашего Cloudflare Worker.

### 6. Настройка Telegram Bot

1. Найдите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/mybots` → выберите вашего бота
3. **Bot Settings** → **Menu Button** → **Configure menu button**
4. Введите URL:
   ```
   https://username.github.io/RDF-Rocky-bot-twa/profile/profile.html
   ```
5. Название кнопки: `Мой профиль`

### 7. Тестирование

1. Откройте вашего бота в Telegram
2. Нажмите кнопку меню "Мой профиль"
3. Заполните данные и нажмите "Сохранить изменения"
4. Проверьте Airtable — данные должны появиться в таблице!

## 📁 Структура проекта

```
RDF-Rocky-bot-twa/
├── profile/                      # Модуль профиля пользователя
│   ├── profile.html              # ✅ Реализован
│   ├── config.js                 # Локальные настройки (не коммитится)
│   └── config.example.js         # Шаблон конфигурации
├── callsheet/                    # Модуль вызывного листа
│   └── (в разработке)
├── feedback/                     # Модуль обратной связи
│   └── (в разработке)
├── admin/                        # Админ-панель
│   └── (в разработке)
├── Work_progress/                # Документация разработки
│   ├── Plan1.md                  # Первоначальный план
│   ├── in-progress-phases.md     # Детальные фазы
│   └── in-progress-part-2.md     # Текущий прогресс
├── cloudflare-worker.js          # Код Cloudflare Worker
├── CLOUDFLARE_SETUP.md           # Инструкция по настройке
├── index.html                    # Главная страница
├── .gitignore                    # Исключения Git
└── README.md                     # Этот файл
```

## 🔐 Безопасность

### Хранение секретов

**❌ НЕ КОММИТЬТЕ** в Git:
- Airtable Personal Access Tokens
- API ключи
- Приватные конфигурации

**✅ ИСПОЛЬЗУЙТЕ:**
- `profile/config.js` для локальной разработки (добавлен в `.gitignore`)
- Cloudflare Workers для продакшена (секреты хранятся на сервере)

### CORS

Cloudflare Worker настроен на прием запросов с любых источников (`Access-Control-Allow-Origin: *`). Для продакшена рекомендуется ограничить до конкретного домена GitHub Pages.

## 🛠️ Разработка

### Локальное тестирование profile.html

1. Создайте `profile/config.js`:
   ```javascript
   const AIRTABLE_CONFIG = {
       TOKEN: 'ваш_токен',
       BASE_ID: 'ваш_base_id',
       TABLE_NAME: 'Пользователи'
   };
   ```
2. Откройте `profile/profile.html` с помощью Live Server в VS Code
3. Тестируйте изменения локально

### Деплой изменений

```bash
git add .
git commit -m "описание изменений"
git push
```

GitHub Pages автоматически обновится через 1-2 минуты.

## 📊 API Endpoints (Cloudflare Worker)

### GET /profile

Получение данных профиля пользователя.

**Query параметры:**
- `chat_id` (required) — Telegram ID пользователя

**Пример:**
```
GET https://your-worker.workers.dev/profile?chat_id=182719187
```

**Ответ:**
```json
{
  "id": "recXXXXXXXXXX",
  "fields": {
    "chat_id": "182719187",
    "@username": "urso_barbudos",
    "Контактный телефон": "+7 (999) 123-45-67",
    "Платежные реквизиты": "Карта: 1234 5678 9012 3456",
    "Примечание": "Оператор"
  }
}
```

### POST /profile

Создание или обновление профиля.

**Body:**
```json
{
  "recordId": "recXXXXXXXXXX",  // null для создания новой записи
  "userData": {
    "chat_id": "182719187",
    "@username": "urso_barbudos",
    "Контактный телефон": "+7 (999) 123-45-67",
    "Платежные реквизиты": "Карта: 1234 5678 9012 3456",
    "Примечание": "Оператор"
  }
}
```

**Ответ:**
```json
{
  "records": [
    {
      "id": "recXXXXXXXXXX",
      "fields": { /* обновленные данные */ }
    }
  ]
}
```

## 🎯 Roadmap

### ✅ Фаза 0: Подготовка (Завершена)
- Настройка GitHub Pages
- Настройка репозитория
- Создание структуры проекта

### ✅ Фаза 1: Профиль пользователя (Завершена)
- HTML форма профиля
- Интеграция с Airtable API
- Cloudflare Worker для безопасности
- Telegram Web App интеграция

### 🚧 Фаза 2: Пользовательские фичи (В разработке)
- [ ] Интерактивный вызывной лист (`callsheet.html`)
- [ ] Форма обратной связи (`feedback.html`)
- [ ] Автоматические напоминания

### 📅 Фаза 3: Админ-инструменты (Запланировано)
- [ ] Админ-панель (`admin_expenses.html`)
- [ ] Утверждение расходов
- [ ] Статистика и отчеты

## 🤝 Вклад в проект

Если вы хотите внести вклад:

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📝 Лицензия

Этот проект создан для внутреннего использования RDF Production.

## 👥 Авторы

- **UrsoBarbudos** — разработка и архитектура
- **GitHub Copilot** — помощь в разработке

## 📞 Поддержка

По вопросам и проблемам создавайте [Issues](https://github.com/UrsoBarbudos/RDF-Rocky-bot-twa/issues) в репозитории.

---

**Статус проекта:** 🚧 В активной разработке

**Последнее обновление:** 10 ноября 2025 г.
