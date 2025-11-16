# 📊 План внедрения ленты событий (Event Feed)

> **Проект:** Rocky v2 BOT  
> **Дата:** 15 ноября 2024  
> **Статус:** Ready for implementation

## 🎯 Цель проекта

Заменить статичную страницу профиля на единую динамическую ленту событий, отображающую "вызывные" и "расходы" пользователя в хронологическом порядке.

---

## 📋 Текущая архитектура (Анализ)

### Frontend
- **Технологии:** Статичные HTML + Vanilla JavaScript
- **Основной файл:** `public/profile/profile.html` (634 строки) → **БУДЕТ АРХИВИРОВАН**
- **Интеграция:** Telegram Web App API
- **Функциональность:** Отображение и редактирование профиля пользователя

### Backend  
- **Технология:** Vercel Serverless Functions
- **Основной файл:** `api/profile.js` (263 строки) → **ОСТАЕТСЯ ДЛЯ ПОЛУЧЕНИЯ @username**
- **База данных:** Airtable (таблица "Пользователи")
- **Эндпоинты:** 
  - `GET /api/profile` - получение профиля
  - `POST /api/profile` - обновление профиля

### Структура данных (Airtable)
**Таблица "Пользователи":**
- `chat_id` (Number)
- `@username` (Single line text)
- `Статус доступа` (Single select): Approved/Blocked/Pending
- `Role` (Single select)

---

## 🚀 Концепция ленты событий

### Что такое лента событий?
Единая страница, заменяющая профиль, отображающая хронологический список:

- 📞 **Новые вызывные:** Поступление заказов/задач с автогенерируемым ID
- 💰 **Расходы:** Учет трат с суммой и описанием

### Преимущества новой архитектуры
1. **Единый интерфейс:** Все действия на одной странице
2. **Простота:** Фокус на двух основных типах событий
3. **Хронология:** Четкая временная структура
4. **Легкость:** Минимум информации — только необходимое

---

## 🏗️ Архитектурное решение

### Диаграмма новой архитектуры

```mermaid
graph TD
    subgraph "Frontend (Telegram Web App)"
        A[Лента событий - /feed/index.html]
        B[Кнопки: Добавить вызывной/расход]
    end

    subgraph "Backend (Vercel Functions)"
        D[GET /api/events<br/>Получение ленты]
        E[POST /api/events<br/>Создание события]
        F[GET /api/profile<br/>Получение @username]
    end

    subgraph "Database (Airtable)"
        H[(Таблица "Пользователи")]
        I[(Таблица "События")]
    end

    A --> D --> I
    A --> F --> H
    B --> E --> I
    I -.связь.- H

    style A fill:#e1f5fe
    style D fill:#f3e5f5
    style E fill:#f3e5f5
    style I fill:#fff3e0
```

---

## 📊 Структура данных

### Новая таблица Airtable: "События" (Events)

| Поле | Тип | Описание | Пример |
|------|-----|----------|--------|
| `Event ID` | Autonumber | Уникальный ID события | 1, 2, 3... |
| `User` | Link to "Пользователи" | Связь с пользователем | [@urso_barbudos] |
| `Timestamp` | Created Time | Дата/время создания | 2024-11-15T15:30:00Z |
| `Event Type` | Single select | Тип события | Вызывной, Расход |
| `Call ID` | Formula | **Автогенерируемый ID вызывного** | CALL-12345 |
| `Title` | Formula | **Автогенерируемый заголовок** | "📞 Новый вызывной CALL-12345" |
| `Amount` | Currency | Сумма (только для расходов) | 1500₽ |
| `Description` | Long text | Описание (только для расходов) | "Заправка на АЗС" |

### Formula для поля `Call ID`
Генерирует уникальный ID только для вызывных:
```
IF({Event Type} = 'Вызывной', 'CALL-' & RECORD_ID(), '')
```

### Formula для поля `Title`
Генерирует заголовок в зависимости от типа события:
```
SWITCH(
  {Event Type},
  'Вызывной', '📞 Новый вызывной ' & {Call ID},
  'Расход', '💰 Расход: ' & {Amount} & '₽',
  ''
)
```

### Типы событий (Event Type)
- 📞 **Вызывной** - новая задача/заказ (использует поля: `Call ID`, автогенерируемый)
- 💰 **Расход** - трата денег (использует поля: `Amount`, `Description`)

---

## 🛠️ Реализация Backend

### 1. Новый API эндпоинт: `api/events.js`

```javascript
// Структура нового файла api/events.js
export default async function handler(req, res) {
  // CORS заголовки (безопасность)
  res.setHeader('Access-Control-Allow-Origin', 'https://web.telegram.org');
  
  if (req.method === 'GET') {
    // Получение списка событий для пользователя
    // 1. Проверить chat_id в query
    // 2. Получить события пользователя за один запрос
    // 3. Сортировать по Timestamp (DESC)
    // 4. Вернуть JSON
  }
  
  if (req.method === 'POST') {
    // Создание нового события
    // 1. Проверить данные в body
    // 2. Валидация полей в зависимости от типа:
    //    - Для "Вызывной": только eventType
    //    - Для "Расход": amount (required), description
    // 3. Создать запись в таблице "События"
    // 4. Вернуть успешный ответ
  }
}
```

### 2. Модификация класса AirtableAPI

Добавить методы для работы с таблицей "События":

```javascript
// Создание события
async createEvent(userId, eventType, data = {}) {
  const baseFields = {
    'User': [userId], // Link to record
    'Event Type': eventType
  };
  
  // Дополнительные поля для расходов
  if (eventType === 'Расход') {
    baseFields['Amount'] = data.amount;
    baseFields['Description'] = data.description || '';
  }
  
  return await this.create('События', baseFields);
}

// Получение событий пользователя
async getUserEvents(chatId, limit = 50) {
  const formula = `AND({User} = '${chatId}')`;
  return await this.list('События', {
    filterByFormula: formula,
    sort: [{field: 'Timestamp', direction: 'desc'}],
    maxRecords: limit
  });
}
```

---

## 🎨 Реализация Frontend

### 1. Новая структура файлов

```
public/
├── profile/                  # АРХИВИРУЕТСЯ
│   └── profile.html          # Старый профиль (остается для истории)
└── feed/                     # НОВАЯ ОСНОВНАЯ ДИРЕКТОРИЯ
    ├── index.html            # Единственная страница приложения
    └── assets/
        ├── feed.css          # Стили для ленты
        └── feed.js           # Логика ленты
```

### 2. Основная страница: `public/feed/index.html`

#### Ключевые компоненты:
1. **Шапка с ником пользователя** (из Telegram)
2. **Кнопки действий:**
   - 📞 Добавить вызывной
   - 💰 Добавить расход
3. **Лента событий (список карточек)**

#### Структуры карточек:

```html
<!-- Вызывной -->
<div class="event-card call">
  <div class="event-header">
    <span class="event-icon">📞</span>
    <span class="event-time">15:30</span>
  </div>
  <div class="event-content">
    <h3>Новый вызывной CALL-12345</h3>
  </div>
</div>

<!-- Расход -->
<div class="event-card expense">
  <div class="event-header">
    <span class="event-icon">💰</span>
    <span class="event-time">14:20</span>
  </div>
  <div class="event-content">
    <h3>Расход: 1500₽</h3>
    <p class="expense-description">Заправка на АЗС</p>
  </div>
</div>
```

### 3. JavaScript логика (`public/feed/assets/feed.js`)

```javascript
// Получение ника пользователя для шапки
async function loadUserInfo(chatId) {
  const response = await fetch(`/api/profile?chat_id=${chatId}`);
  const data = await response.json();
  return data.username;
}

// Загрузка событий с сервера
async function loadEvents(chatId) {
  const response = await fetch(`/api/events?chat_id=${chatId}`);
  return await response.json();
}

// Рендеринг событий в DOM
function renderEvents(events) {
  return events.map(event => {
    const type = event.fields['Event Type'];
    const title = event.fields['Title'];
    const timestamp = new Date(event.fields['Timestamp']).toLocaleString();
    
    const cardClass = type === 'Вызывной' ? 'call' : 'expense';
    const icon = type === 'Вызывной' ? '📞' : '💰';
    
    return `<div class="event-card ${cardClass}">
      <div class="event-header">
        <span class="event-icon">${icon}</span>
        <span class="event-time">${timestamp}</span>
      </div>
      <div class="event-content">
        <h3>${title}</h3>
        ${renderEventDetails(event)}
      </div>
    </div>`;
  }).join('');
}

// Рендеринг деталей события
function renderEventDetails(event) {
  const type = event.fields['Event Type'];
  if (type === 'Расход' && event.fields['Description']) {
    return `<p class="expense-description">${event.fields['Description']}</p>`;
  }
  return '';
}

// Создание нового вызывного
async function createCall() {
  return await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'Вызывной'
    })
  });
}

// Создание нового расхода
async function createExpense(amount, description) {
  return await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'Расход',
      amount: amount,
      description: description
    })
  });
}
```

---

## 📱 UI/UX Дизайн

### Цветовая схема
- **Основной фон:** `#E3E3E3` 
- **Карточки:** `rgba(255, 255, 255, 0.95)`
- **Вызывной:** `#2ed573` (зеленый акцент)
- **Расход:** `#ff4757` (красный акцент)

### Дизайн карточек

| Тип | Эмодзи | Цвет акцента | Особенности |
|-----|--------|-------------|-------------|
| Вызывной | 📞 | #2ed573 | Только заголовок с Call ID |
| Расход | 💰 | #ff4757 | Сумма + описание |

### Адаптивность
- Оптимизация под мобильные устройства (Telegram WebApp)
- Размеры экрана: 320px - 480px ширина
- Touch-friendly кнопки (минимум 44px)

---

## 📋 Пошаговый план внедрения

### ЭТАП 1: Настройка базы данных
**Время:** ~20 минут

#### Задачи:
1. **[ ] Создать таблицу "События" в Airtable**
   - Добавить поля: Event ID (Autonumber), User (Link), Timestamp (Created Time)
   - Добавить поля: Event Type (Single select), Amount (Currency), Description (Long text)
   - Настроить связь с таблицей "Пользователи"

2. **[ ] Настроить типы событий**
   - Создать Single Select поле "Event Type": Вызывной, Расход

3. **[ ] Настроить формулы**
   - Call ID: `IF({Event Type} = 'Вызывной', 'CALL-' & RECORD_ID(), '')`
   - Title: `SWITCH({Event Type}, 'Вызывной', '📞 Новый вызывной ' & {Call ID}, 'Расход', '💰 Расход: ' & {Amount} & '₽', '')`

4. **[ ] Протестировать структуру**
   - Создать тестовые записи для вызывных и расходов
   - Проверить автогенерацию Call ID и заголовков

---

### ЭТАП 2: Разработка Backend API
**Время:** ~1-2 часа

#### Задачи:
1. **[ ] Создать `api/events.js`**
   - Скопировать базовую структуру из `api/profile.js`
   - Адаптировать AirtableAPI класс для работы с таблицей "События"

2. **[ ] Реализовать GET /api/events**
   - Получение chat_id из query
   - Запрос событий пользователя через filterByFormula
   - Сортировка по Timestamp (DESC)

3. **[ ] Реализовать POST /api/events**
   - Валидация eventType
   - Создание записи с учетом типа события
   - Возврат результата с автогенерированным заголовком

4. **[ ] Тестирование API**
   - Проверить GET запросы через Postman
   - Протестировать POST для вызывных (без данных)
   - Протестировать POST для расходов (amount + description)

---

### ЭТАП 3: Frontend - Основная страница
**Время:** ~2-3 часа

#### Задачи:
1. **[ ] Создать структуру директорий**
   ```
   public/feed/
   ├── index.html  
   └── assets/
       ├── feed.css
       └── feed.js
   ```

2. **[ ] Разработать `index.html`**
   - HTML структура для ленты событий
   - Интеграция с Telegram WebApp
   - Шапка с местом для ника
   - Две кнопки действий

3. **[ ] Создать `feed.css`**
   - Стили для карточек событий
   - Разные стили для вызывных и расходов
   - Адаптивность под мобильные устройства

4. **[ ] Разработать `feed.js`**
   - Функции для работы с API
   - Загрузка ника пользователя в шапку
   - Рендеринг событий в ленте
   - Создание новых событий

---

### ЭТАП 4: Интеграция и функциональность
**Время:** ~1-2 часа

#### Задачи:
1. **[ ] Полная интеграция**
   - Настроить загрузку ника через GET /api/profile
   - Настроить загрузку событий через GET /api/events
   - Добавить индикаторы загрузки

2. **[ ] Функциональность кнопок**
   - Кнопка "Добавить вызывной" → POST /api/events
   - Кнопка "Добавить расход" → форма ввода → POST /api/events
   - Обновление ленты после добавления

3. **[ ] UX улучшения**
   - Мгновенное обновление ленты
   - Базовая валидация форм
   - Уведомления об успехе/ошибке

---

### ЭТАП 5: Переключение на новую систему
**Время:** ~30 минут

#### Задачи:
1. **[ ] Тестирование новой системы**
   - Полная проверка функциональности в Telegram WebApp
   - Тест создания вызывных и расходов
   - Проверка корректности отображения

2. **[ ] Обновление точки входа**
   - Изменить URL в Telegram боте с `/profile/profile.html` на `/feed/index.html`
   - Протестировать переход

3. **[ ] Архивация старого профиля**
   - Переместить `public/profile/` в `archive/profile/` (опционально)
   - Обновить документацию

---

## 🚦 Критерии готовности

### Минимально жизнеспособный продукт (MVP):
- [x] Единая страница ленты событий заменяет профиль
- [x] Пользователь может создавать вызывные (с автогенерируемым ID)
- [x] Пользователь может создавать расходы (с суммой и описанием)
- [x] События отображаются в хронологическом порядке
- [x] В шапке отображается ник из Telegram

### Возможные улучшения:
- [ ] Редактирование и удаление событий
- [ ] Фильтрация по типу события
- [ ] Статистика по расходам
- [ ] Экспорт данных

---

## 🔗 Интеграция с существующим Telegram-ботом

### Текущее состояние

**Telegram-бот уже настроен:**
- ✅ Кнопка WebApp настроена в меню бота через BotFather
- ✅ N8N workflow ([MAIN] Rocky_v2_webapp-10) обрабатывает регистрацию пользователей
- ✅ Таблица "Пользователи" в Airtable уже существует и работает

### Схема интеграции

```mermaid
graph TD
    A[Пользователь нажимает кнопку в Telegram]
    B[BotFather открывает WebApp]
    C[Лента событий /feed/index.html]
    D[API/events.js]
    E[Airtable: таблица "События"]
    F[N8N Workflow]
    G[Airtable: таблица "Пользователи"]
    
    A --> B --> C
    C --> D --> E
    F --> G
    E -.связь.- G
    
    style C fill:#e1f5fe
    style F fill:#f0f0f0
    style E fill:#fff3e0
    style G fill:#e8f5e8
```

### Задачи интеграции

#### 1. **Обновление URL в BotFather** ⚠️ КРИТИЧНАЯ ЗАДАЧА
После успешного развертывания на Vercel:

1. Получить финальный URL: `https://your-app.vercel.app/feed/index.html`
2. Обновить URL кнопки WebApp в настройках BotFather
3. Протестировать открытие ленты через кнопку бота

#### 2. **Независимость от N8N workflow**
- 🔹 **Лента событий работает независимо** от N8N
- 🔹 **N8N отвечает только за регистрацию** пользователей
- 🔹 **Создание событий** происходит через кнопки в WebApp → API
- 🔹 **Связь данных** через поле `User` в таблице "События"

#### 3. **Проверка совместимости полей**
✅ **Поля в таблице "Пользователи" (из N8N) полностью совместимы:**
- `chat_id` ← используется для связи с событиями
- `@username` ← отображается в шапке ленты
- `Статус доступа` ← проверяется при доступе к API

### Финальная схема работы

1. **Регистрация** (N8N): `/start` → регистрация → админ апрув → статус `Approved`
2. **Использование** (WebApp): Кнопка меню → лента событий → создание вызывных/расходов
3. **Данные** (Airtable): Таблица "Пользователи" ↔ Таблица "События"

---

## 📚 Ресурсы и справочники

### API документация:
- [Airtable API](https://airtable.com/developers/web/api/introduction)
- [Telegram WebApp API](https://core.telegram.org/bots/webapps)
- [Vercel Functions](https://vercel.com/docs/functions/serverless-functions)

### Инструменты разработки:
- [Telegram Bot API для тестирования](https://core.telegram.org/bots/api)
- [Airtable Web Interface](https://airtable.com)
- [Vercel Dashboard](https://vercel.com/dashboard)

---

## 🤝 Следующие шаги

1. **Начать с настройки Airtable** - создание таблицы "События" и настройка формул
2. **Разработка Backend** - создание `api/events.js` для работы с событиями
3. **Создание Frontend** - единой страницы ленты событий
4. **Тестирование и переход** - замена старого профиля на новую ленту

---

*Документ обновлен: 15 ноября 2024*  
*Версия: 2.0*  
*Статус: Ready for implementation*