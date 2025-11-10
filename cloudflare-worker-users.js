// Обновленный Cloudflare Worker для Rocky Bot
// =============================================
// 🎯 РАБОТА С ТАБЛИЦЕЙ "Пользователи" v4.0
// =============================================
// 
// Endpoints:
// ✅ GET /api/profile?chat_id=123 - получение данных профиля
// ✅ POST /api/register - регистрация нового пользователя
// ✅ Проверка статуса в таблице "Пользователи"
// ✅ Уведомления в n8n через webhook
// =============================================

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
  
  // Убираем лишние пробелы
  const cleaned = username.trim();
  
  // Убираем множественные @ в начале и приводим к одному @
  const normalized = cleaned.replace(/^@+/, '@');
  
  // Если нет @ в начале, добавляем
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS заголовки
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data'
    };

    // Обработка preflight запросов
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    // Инициализация Airtable API
    const airtable = new AirtableAPI(env.AIRTABLE_TOKEN);

    try {
      // ============================================
      // 📊 GET /api/profile или /profile - Получение профиля пользователя
      // ============================================
      if ((path === '/api/profile' || path === '/profile') && request.method === 'GET') {
        const chatId = url.searchParams.get('chat_id');
        
        if (!chatId) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request', 
            message: 'Параметр chat_id обязателен' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Проверка доступа
        const accessCheck = await checkUserAccess(chatId, airtable);
        
        if (!accessCheck.approved) {
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: accessCheck.message,
            reason: accessCheck.reason,
            redirect: accessCheck.reason === 'not_registered' ? 'registration' : null
          }), {
            status: accessCheck.reason === 'not_registered' ? 404 : 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Возвращаем полные данные пользователя
        const userFields = accessCheck.user.fields;
        
        return new Response(JSON.stringify({
          success: true,
          user: {
            id: accessCheck.user.id,
            chat_id: userFields.chat_id,
            username: normalizeUsername(userFields['@username']),
            first_name: userFields.FirstName || '',
            last_name: userFields.LastName || '',
            payment_info: userFields['Платежные данные'] || '',
            notes: userFields['Примечание'] || '',
            role: userFields.Role || 'USER',
            status: userFields['Статус доступа'],
            registration_date: userFields.RegistrationDate
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 📝 POST /api/register или /registration - Регистрация пользователя
      // ============================================
      if ((path === '/api/register' || path === '/registration') && request.method === 'POST') {
        const body = await request.json();
        const { chat_id, username, first_name, last_name } = body;
        
        if (!chat_id) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'Параметр chat_id обязателен' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Проверяем, существует ли уже пользователь
        const existingUser = await airtable.list(USERS_TABLE, {
          filterByFormula: `{chat_id} = ${chat_id}`,
          maxRecords: 1
        });

        if (existingUser.records.length > 0) {
          const status = existingUser.records[0].fields['Статус доступа'];
          let message = 'Вы уже зарегистрированы в системе.';
          
          if (status === 'Pending') {
            message = 'Ваша заявка уже отправлена и ожидает одобрения администратора.';
          } else if (status === 'Approved') {
            message = 'Вы уже зарегистрированы и одобрены!';
          } else if (status === 'Blocked') {
            message = 'Ваша регистрация заблокирована. Обратитесь к администратору.';
          }
          
          return new Response(JSON.stringify({ 
            error: 'Already Registered',
            message: message,
            status: status
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Создаем новую запись
        const newUser = await airtable.create(USERS_TABLE, {
          chat_id: parseInt(chat_id),
          '@username': username || '',
          FirstName: first_name || '',
          LastName: last_name || '',
          Role: 'USER',
          'Статус доступа': 'Pending',
          RegistrationDate: new Date().toISOString()
        });

        console.log('New user created:', newUser.id);

        // Отправляем уведомление в n8n (если webhook настроен)
        if (env.N8N_WEBHOOK_URL) {
          try {
            await fetch(env.N8N_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'new_registration',
                user: {
                  chat_id: chat_id,
                  username: username,
                  first_name: first_name,
                  last_name: last_name,
                  record_id: newUser.id,
                  full_name: [first_name, last_name].filter(n => n).join(' ') || 'Не указано'
                }
              })
            });
            console.log('N8N notification sent successfully');
          } catch (error) {
            console.error('Failed to notify n8n:', error);
            // Не останавливаем выполнение, если уведомление не удалось
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Заявка успешно отправлена! Ожидайте одобрения администратора.',
          record_id: newUser.id
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 💾 POST /api/profile или /profile - Обновление профиля
      // ============================================
      if ((path === '/api/profile' || path === '/profile') && request.method === 'POST') {
        const body = await request.json();
        const { chat_id, payment_info, notes } = body;
        
        if (!chat_id) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'Параметр chat_id обязателен' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Проверка доступа
        const accessCheck = await checkUserAccess(chat_id, airtable);
        
        if (!accessCheck.approved) {
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: accessCheck.message
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Обновляем профиль пользователя
        const updatedFields = {};
        if (payment_info !== undefined) updatedFields['Платежные данные'] = payment_info;
        if (notes !== undefined) updatedFields['Примечание'] = notes;

        if (Object.keys(updatedFields).length === 0) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'Нет данных для обновления' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const updatedUser = await airtable.update(USERS_TABLE, accessCheck.user.id, updatedFields);
        
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Профиль успешно обновлен',
          user: updatedUser
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 🔍 GET /api/status - Проверка статуса пользователя
      // ============================================
      if (path === '/api/status' && request.method === 'GET') {
        const chatId = url.searchParams.get('chat_id');
        
        if (!chatId) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request', 
            message: 'Параметр chat_id обязателен' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const accessCheck = await checkUserAccess(chatId, airtable);
        
        return new Response(JSON.stringify({
          chat_id: chatId,
          registered: accessCheck.approved || accessCheck.reason !== 'not_registered',
          approved: accessCheck.approved,
          status: accessCheck.user?.fields['Статус доступа'] || 'not_registered',
          message: accessCheck.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 404 для остальных путей
      // ============================================
      return new Response(JSON.stringify({ 
        error: 'Not Found',
        message: `Путь ${path} не найден`,
        available_endpoints: [
          'GET /api/profile?chat_id=123',
          'POST /api/register',
          'POST /api/profile',
          'GET /api/status?chat_id=123'
        ]
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};