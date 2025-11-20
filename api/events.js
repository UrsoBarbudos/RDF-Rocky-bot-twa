// Vercel API Function: Events Endpoint
// ====================================
// 🎯 GET/POST /api/events - управление лентой событий
// ====================================

const AIRTABLE_BASE_ID = 'appCukWqzOVvwnB75';
const USERS_TABLE = 'Пользователи';
const EVENTS_TABLE = 'События';

// Класс для работы с Airtable API
class AirtableAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
  }

  async list(table, options = {}) {
    const url = new URL(`${this.baseUrl}/${encodeURIComponent(table)}`);
    
    if (options.filterByFormula) {
      url.searchParams.append('filterByFormula', options.filterByFormula);
    }
    if (options.fields) {
      options.fields.forEach(field => {
        url.searchParams.append('fields[]', field);
      });
    }
    if (options.maxRecords) {
      url.searchParams.append('maxRecords', options.maxRecords.toString());
    }
    if (options.sort) {
        options.sort.forEach(sortField => {
            url.searchParams.append(`sort[0][field]`, sortField.field);
            url.searchParams.append(`sort[0][direction]`, sortField.direction);
        });
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable list error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  async create(table, fields) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable create error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
  
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
    
    return await this.create(EVENTS_TABLE, baseFields);
  }

  // Получение событий пользователя
  async getUserEvents(userRecordId, limit = 50) {
    // Используем RECORD_ID() пользователя для фильтрации
    const formula = `{User} = RECORD_ID()`;
    return await this.list(EVENTS_TABLE, {
        filterByFormula: `FIND('${userRecordId}', ARRAYJOIN({User}))`,
        sort: [{field: 'Timestamp', direction: 'desc'}],
        maxRecords: limit
    });
  }
}

// Проверка доступа пользователя (скопирована из profile.js)
async function checkUserAccess(chatId, airtable) {
  try {
    const chatIdNum = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    const result = await airtable.list(USERS_TABLE, {
      filterByFormula: `{chat_id} = ${chatIdNum}`,
      fields: ['chat_id', 'Статус доступа'],
      maxRecords: 1
    });
    
    if (result.records.length === 0) {
      return { approved: false, reason: 'not_registered', message: 'Вы не зарегистрированы.' };
    }
    
    const user = result.records[0];
    const status = user.fields['Статус доступа'];
    
    if (status === 'Approved') {
      return { approved: true, user: user };
    } else if (status === 'Blocked') {
      return { approved: false, reason: 'blocked', message: 'Ваш доступ заблокирован.' };
    } else {
      return { approved: false, reason: 'pending', message: 'Ваша заявка ожидает одобрения.' };
    }
  } catch (error) {
    console.error('User access check error:', error);
    return { approved: false, reason: 'error', message: 'Ошибка проверки доступа.' };
  }
}

// Главная функция Netlify API
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  if (!process.env.AIRTABLE_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Configuration Error', message: 'AIRTABLE_TOKEN не настроен' })
    };
  }

  const airtable = new AirtableAPI(process.env.AIRTABLE_TOKEN);
  
  try {
    // ============================================
    // 📦 GET /api/events - Получение ленты событий
    // ============================================
    if (event.httpMethod === 'GET') {
      const { chat_id } = event.queryStringParameters;
      if (!chat_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Bad Request', message: 'Параметр chat_id обязателен' })
        };
      }

      const accessCheck = await checkUserAccess(chat_id, airtable);
      if (!accessCheck.approved) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Access Denied', reason: accessCheck.reason, message: accessCheck.message })
        };
      }

      const events = await airtable.getUserEvents(accessCheck.user.id);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: events.records })
      };
    }

    // ============================================
    // ➕ POST /api/events - Создание нового события
    // ============================================
    else if (event.httpMethod === 'POST') {
      const { chat_id, eventType, amount, description } = JSON.parse(event.body || '{}');
       if (!chat_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Bad Request', message: 'Параметр chat_id обязателен' })
        };
      }

      const accessCheck = await checkUserAccess(chat_id, airtable);
      if (!accessCheck.approved) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Access Denied', reason: accessCheck.reason, message: accessCheck.message })
        };
      }

      if (!eventType || !['Вызывной', 'Расход'].includes(eventType)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Bad Request', message: 'Некорректный или отсутствующий eventType' })
        };
      }

      if (eventType === 'Расход' && (typeof amount !== 'number' || amount <= 0)) {
         return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Bad Request', message: 'Для расхода необходимо указать корректную сумму (amount)' })
        };
      }
      
      const eventData = { amount, description };
      const newEvent = await airtable.createEvent(accessCheck.user.id, eventType, eventData);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, message: 'Событие успешно создано', data: newEvent })
      };
    }

    // Неподдерживаемый метод
    else {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method Not Allowed', message: `Метод ${event.httpMethod} не поддерживается` })
      };
    }

  } catch (error) {
    console.error('Events API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error', message: 'Внутренняя ошибка сервера' })
    };
  }
};