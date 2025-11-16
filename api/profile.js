// Vercel API Function: Profile Endpoint
// ====================================
// 🎯 GET/POST /api/profile - управление профилем пользователя
// Мигрировано с Cloudflare Worker на Vercel Functions
// ====================================

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

  async update(table, recordId, fields) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable update error: ${response.status} ${errorText}`);
    }

    return await response.json();
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

// Проверка доступа пользователя
async function checkUserAccess(chatId, airtable) {
  try {
    console.log('Checking user access for chat_id:', chatId);
    
    const result = await airtable.list(USERS_TABLE, {
      filterByFormula: `{chat_id} = ${chatId}`,
      fields: ['chat_id', 'Статус доступа', '@username', 'FirstName', 'LastName'],
      maxRecords: 1
    });
    
    if (result.records.length === 0) {
      return { 
        approved: false, 
        reason: 'not_registered',
        message: 'Вы не зарегистрированы в системе. Подайте заявку на регистрацию.'
      };
    }
    
    const user = result.records[0];
    const status = user.fields['Статус доступа'];
    
    if (status === 'Approved') {
      return { approved: true, user: user };
    } else if (status === 'Blocked') {
      return { 
        approved: false, 
        reason: 'blocked',
        message: 'Ваш доступ заблокирован. Обратитесь к администратору.'
      };
    } else {
      return { 
        approved: false, 
        reason: 'pending',
        message: 'Ваша заявка ожидает одобрения администратора.'
      };
    }
  } catch (error) {
    console.error('User access check error:', error);
    return { 
      approved: false, 
      reason: 'error',
      message: 'Ошибка проверки доступа. Попробуйте позже.'
    };
  }
}

// Главная функция Vercel API
export default async function handler(req, res) {
  // ===========================================
  // ДИАГНОСТИКА: Логирование User-Agent
  const userAgent = req.headers['user-agent'] || 'N/A';
  console.log(`[DIAGNOSTICS] Request received. User-Agent: "${userAgent}"`);
  // ===========================================

  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Init-Data');

  // Обработка preflight запросов
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверка переменных окружения
  if (!process.env.AIRTABLE_TOKEN) {
    return res.status(500).json({ 
      error: 'Configuration Error', 
      message: 'AIRTABLE_TOKEN не настроен' 
    });
  }

  // Инициализация Airtable API
  const airtable = new AirtableAPI(process.env.AIRTABLE_TOKEN);

  try {
    // ============================================
    // 📊 GET /api/profile - Получение профиля пользователя
    // ============================================
    if (req.method === 'GET') {
      const { chat_id } = req.query;
      
      if (!chat_id) {
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Параметр chat_id обязателен' 
        });
      }

      // Проверка доступа
      const accessCheck = await checkUserAccess(chat_id, airtable);
      
      if (!accessCheck.approved) {
        return res.status(403).json({
          error: 'Access Denied',
          reason: accessCheck.reason,
          message: accessCheck.message
        });
      }

      // Получение полных данных пользователя
      const result = await airtable.list(USERS_TABLE, {
        filterByFormula: `{chat_id} = ${chat_id}`,
        maxRecords: 1
      });

      const user = result.records[0];
      const fields = user.fields;

      // Формирование ответа
      const profileData = {
        chat_id: fields.chat_id,
        username: normalizeUsername(fields['@username']),
        first_name: fields.FirstName || '',
        last_name: fields.LastName || '',
        phone: fields['Контактный телефон'] || '',
        payment_details: fields['Платежные реквизиты'] || '',
        notes: fields['Примечание'] || '',
        status: fields['Статус доступа'],
        role: fields.Role || 'USER'
      };

      return res.status(200).json({
        success: true,
        data: profileData
      });
    }

    // ============================================
    // 💾 POST /api/profile - Обновление профиля пользователя
    // ============================================
    else if (req.method === 'POST') {
      const data = req.body;
      const chatId = data.chat_id;

      if (!chatId) {
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Поле chat_id обязательно' 
        });
      }

      // Проверка доступа
      const accessCheck = await checkUserAccess(chatId, airtable);
      
      if (!accessCheck.approved) {
        return res.status(403).json({
          error: 'Access Denied',
          reason: accessCheck.reason,
          message: accessCheck.message
        });
      }

      // Подготовка данных для обновления
      const updateFields = {};
      
      if (data.username) updateFields['@username'] = normalizeUsername(data.username);
      if (data.first_name !== undefined) updateFields['FirstName'] = data.first_name;
      if (data.last_name !== undefined) updateFields['LastName'] = data.last_name;
      if (data.phone !== undefined) updateFields['Контактный телефон'] = data.phone;
      if (data.payment_details !== undefined) updateFields['Платежные реквизиты'] = data.payment_details;
      if (data.notes !== undefined) updateFields['Примечание'] = data.notes;

      // Обновление записи
      const recordId = accessCheck.user.id;
      await airtable.update(USERS_TABLE, recordId, updateFields);

      return res.status(200).json({
        success: true,
        message: 'Профиль успешно обновлен'
      });
    }

    // Неподдерживаемый метод
    else {
      return res.status(405).json({ 
        error: 'Method Not Allowed', 
        message: `Метод ${req.method} не поддерживается` 
      });
    }

  } catch (error) {
    console.error('Profile API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Внутренняя ошибка сервера'
    });
  }
}