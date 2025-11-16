// Vercel API Function: Register Endpoint
// =====================================
// 🎯 POST /api/register - регистрация нового пользователя
// Мигрировано с Cloudflare Worker на Vercel Functions
// =====================================

const AIRTABLE_BASE_ID = 'appCukWqzOVvwnB75';
const USERS_TABLE = 'Пользователи';

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
      body: JSON.stringify({
        records: [{ fields }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable create error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result.records[0];
  }
}

// Функция для нормализации username
function normalizeUsername(username) {
  if (!username) return '';
  
  const cleaned = username.trim();
  const normalized = cleaned.replace(/^@+/, '@');
  
  if (normalized && !normalized.startsWith('@')) {
    return '@' + normalized;
  }
  
  return normalized;
}

// Главная функция Netlify API
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed', message: 'Только POST метод поддерживается для регистрации' })
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
    const { chat_id, username, first_name, last_name } = JSON.parse(event.body || '{}');

    if (!chat_id || !username) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Bad Request', message: 'Поля chat_id и username обязательны' })
      };
    }

    const existingUser = await airtable.list(USERS_TABLE, {
      filterByFormula: `{chat_id} = ${chat_id}`,
      fields: ['chat_id', 'Статус доступа'],
      maxRecords: 1
    });

    if (existingUser.records.length > 0) {
      const status = existingUser.records[0].fields['Статус доступа'];
      const messages = {
        'Approved': 'Вы уже зарегистрированы и одобрены!',
        'Blocked': 'Ваш аккаунт заблокирован. Обратитесь к администратору.',
        'Pending': 'Ваша заявка уже подана и ожидает одобрения.'
      };

      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: 'User Already Exists',
          message: messages[status] || 'Пользователь уже существует',
          status: status
        })
      };
    }

    const normalizedUsername = normalizeUsername(username);
    
    const newUserFields = {
      'chat_id': parseInt(chat_id),
      '@username': normalizedUsername,
      'FirstName': first_name || '',
      'LastName': last_name || '',
      'Статус доступа': 'Pending',
      'Role': 'USER'
    };

    const newUser = await airtable.create(USERS_TABLE, newUserFields);

    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_registration',
            user: {
              chat_id: chat_id,
              username: normalizedUsername,
              first_name: first_name || '',
              last_name: last_name || '',
              record_id: newUser.id,
              full_name: [first_name, last_name].filter(n => n).join(' ') || 'Не указано'
            }
          })
        });
        console.log('N8N notification sent successfully');
      } catch (error) {
        console.error('Failed to notify n8n:', error);
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Заявка успешно отправлена! Ожидайте одобрения администратора.',
        record_id: newUser.id
      })
    };

  } catch (error) {
    console.error('Registration API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'Внутренняя ошибка сервера'
      })
    };
  }
};