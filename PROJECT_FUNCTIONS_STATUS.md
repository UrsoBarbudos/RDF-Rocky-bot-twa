# 📦 Rocky RDF Bot — Список функций и статусов

## 1. Реализованные функции (Production)

### Основные модули и методы:
- **Регистрация пользователя**
  - WebApp: `registration.html`
  - API: `POST /api/register` (`api/register.js`)
  - БД: Airtable (таблица "Пользователи")
  - Автоматизация: n8n workflow (создание записи, уведомление админа)
- **Модерация заявок**
  - Inline кнопки Telegram (approve/block)
  - n8n workflow: обработка callback, обновление статуса в Airtable
- **Профиль пользователя**
  - WebApp: `profile/profile.html`, `profile-v3.html`
  - API: `GET /api/profile?chat_id=...`, `POST /api/profile` (`api/profile.js`)
  - Методы: checkUserAccess, loadUserProfile, saveUserProfile
- **Контроль доступа**
  - Проверка статуса: Pending/Approved/Blocked
  - Ограничение доступа к WebApp и API
- **Безопасность**
  - Проверка Telegram initData (HMAC)
  - Whitelist, Rate Limiting, CORS
- **Документация и диагностика**
  - Файлы: `README.md`, `SECURITY_SETUP.md`, `PROJECT_STATUS.md`, `PHASE1_COMPLETION.md`, `debug.html`

## 2. Не реализованные функции (TODO.md)

### Фаза 2: Вызывные листы
- [ ] Таблица "Вызывные" в Airtable
- [ ] API: `GET /api/callsheet?id=...`, `GET /api/callsheets?chat_id=...`, `POST /api/callsheet`
- [ ] WebApp: `callsheet.html` (дизайн, загрузка данных, статус, карта)
- [ ] Интеграция с ботом: рассылка уведомлений, inline кнопки

### Фаза 2: Фидбэк
- [ ] Таблица "Фидбэк" в Airtable
- [ ] API: `POST /api/feedback`
- [ ] WebApp: `feedback.html` (форма, рейтинг, комментарий)
- [ ] Автоматическая рассылка запросов фидбэка (n8n)

### Фаза 3: Админ-панель расходов
- [ ] Таблица "Расходы" в Airtable
- [ ] API: `GET /api/expenses?status=pending`, `POST /api/expenses/approve`, `POST /api/expenses/reject`, `POST /api/expense`
- [ ] WebApp: `admin_expenses.html` (список, карточки, комментарии)
- [ ] Проверка прав доступа (Role=ADMIN)
- [ ] Уведомления пользователям о решениях

### Дополнительные задачи
- [ ] Общий файл стилей `styles.css`
- [ ] Общий файл функций `utils.js`
- [ ] Оптимизация ресурсов, PWA (Service Worker)
- [ ] Улучшение безопасности: ограничение CORS, валидация initData, rate limiting

#### Методы реализации:
- Использовать существующий подход: Vercel Functions + Airtable API + n8n
- Для WebApp — повторять архитектуру profile.html (fetch, адаптивность, Telegram SDK)
- Для новых API — копировать структуру `api/profile.js`/`api/register.js`
- Для автоматизации — расширять n8n workflow
- Для безопасности — использовать те же проверки initData, CORS, роли

## 3. Не реализованные функции (minds.md)

- [ ] Кнопка "В путь" — интеграция с Яндекс.Карты (выбор авто/пешком, генерация маршрута)
  - Метод: добавить поле "карта" в Airtable, генерировать ссылку, JS обработчик в callsheet.html
- [ ] Автоматическое масштабирование интерфейса WebApp
  - Метод: использовать CSS media queries, JS resize observer, адаптировать дизайн
- [ ] Отправка уведомлений пользователям в рамках вызывного
  - Метод: n8n workflow, Telegram Bot API, рассылка по ролям
- [ ] Алгоритм для повторного входа после очистки чата
  - Метод: хранить статус в Airtable, проверять при старте, повторная регистрация/доступ
- [ ] Создание новых вызывных через WebApp
  - Метод: форма в callsheet.html, API `POST /api/callsheet`, запись в Airtable
- [ ] Уведомление всех участников при изменении вызывного
  - Метод: n8n workflow, отслеживание изменений, рассылка уведомлений

## 4. Рекомендации по реализации

- **API:** Создавать новые endpoints по аналогии с profile/register (Vercel Functions, Airtable)
- **WebApp:** Использовать fetch, Telegram WebApp SDK, адаптивный дизайн
- **Автоматизация:** n8n для рассылок, обработки событий, интеграции с Telegram
- **Безопасность:** Проверка initData, CORS, роли, rate limiting
- **UI/UX:** Единый стиль через styles.css, переиспользуемые функции через utils.js
- **PWA:** Service Worker для офлайн-режима

---
