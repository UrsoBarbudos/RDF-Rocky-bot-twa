// Минимальный Cloudflare Worker для Rocky Bot
// ============================================
// 🎯 УПРОЩЕННАЯ АРХИТЕКТУРА v3.0
// ============================================
// 
// Отвечает ТОЛЬКО за Web Apps:
// ✅ GET/POST /profile - форма профиля пользователя
// ✅ POST /registration - форма регистрации новых пользователей
// ✅ Проверка Whitelist и CORS
// 
// ВСЯ остальная логика в n8n:
// - Telegram команды и сообщения
// - Callback кнопки (approve/reject)
// - Уведомления и автоматизация
// - Прямые запросы к Airtable
// ============================================

// Проверка статуса пользователя в таблице "Пользователи"
async function checkUserAccess(chatId, airtableToken, baseId) {
  const usersTable = 'Пользователи';
  const formula = `{chat_id}=${chatId}`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(usersTable)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  try {
    console.log('Checking user access for chat_id:', chatId);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    });
    
    const data = await response.json();
    console.log('User access response:', JSON.stringify(data));
    
    if (!data.records || data.records.length === 0) {
      console.log('User not found in database');
      return { approved: false, reason: 'not_in_database' };
    }
    
    const status = data.records[0].fields['Статус доступа'];
    console.log('User status:', status);
    
    if (status === 'Approved') {
      return { approved: true, user: data.records[0] };
    } else if (status === 'Blocked') {
      return { approved: false, reason: 'blocked' };
    } else {
      return { approved: false, reason: 'pending_approval' };
    }
  } catch (error) {
    console.error('User access check error:', error);
    return { approved: false, reason: 'error' };
  }
}

// ============================================
// 🚀 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================

export default {
  async fetch(request, env) {
    const AIRTABLE_TOKEN = env.AIRTABLE_TOKEN;
    const BASE_ID = env.BASE_ID;
    const TABLE_NAME = 'Пользователи';
    const N8N_WEBHOOK_URL = env.N8N_WEBHOOK_URL; // URL для уведомлений в n8n

    // CORS заголовки
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    };

    // Обработка preflight запросов
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    console.log('Request path:', path);
    console.log('Request method:', request.method);

    try {
      // ============================================
      // 📊 GET /profile или /api/profile - Получение данных профиля
      // ============================================
      if ((path === '/profile' || path === '/api/profile') && request.method === 'GET') {
        const chatId = url.searchParams.get('chat_id');
        
        console.log('GET /profile request for chat_id:', chatId);
        
        if (!chatId) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request', 
            message: 'Missing chat_id parameter' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 🔐 Проверка доступа пользователя
        const accessCheck = await checkUserAccess(chatId, AIRTABLE_TOKEN, BASE_ID);
        
        if (!accessCheck.approved) {
          let message = 'Доступ запрещен';
          if (accessCheck.reason === 'not_in_database') {
            message = 'Вы не зарегистрированы в системе. Подайте заявку на регистрацию.';
          } else if (accessCheck.reason === 'blocked') {
            message = 'Ваш доступ заблокирован. Обратитесь к администратору.';
          } else if (accessCheck.reason === 'pending_approval') {
            message = 'Ваш запрос на доступ ожидает подтверждения администратора.';
          }
          
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: message,
            redirect: accessCheck.reason === 'not_in_database' ? 'registration' : null
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Получение данных из Airtable
        const formula = `{chat_id}="${chatId}"`;
        const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;

        console.log('Querying Airtable:', airtableUrl);

        const response = await fetch(airtableUrl, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Airtable error:', response.status, errorText);
          return new Response(JSON.stringify({ 
            error: 'Airtable Error', 
            message: `Failed to fetch from Airtable: ${response.status}`,
            details: errorText
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await response.json();
        console.log('Airtable response:', JSON.stringify(data));
        
        const record = data.records[0] || { fields: {}, isNewUser: true };

        return new Response(JSON.stringify(record), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 💾 POST /profile или /api/profile - Сохранение данных профиля
      // ============================================
      if ((path === '/profile' || path === '/api/profile') && request.method === 'POST') {
        const body = await request.json();
        console.log('POST /profile request body:', JSON.stringify(body));
        
        const { recordId, userData } = body;
        
        if (!userData.chat_id) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request', 
            message: 'Missing chat_id in userData' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const chatId = userData.chat_id.toString();

        // 🔐 Проверка доступа пользователя  
        const accessCheck = await checkUserAccess(chatId, AIRTABLE_TOKEN, BASE_ID);
        
        if (!accessCheck.approved) {
          let message = 'Доступ запрещен';
          if (accessCheck.reason === 'not_in_database') {
            message = 'Вы не зарегистрированы в системе. Подайте заявку на регистрацию.';
          } else if (accessCheck.reason === 'blocked') {
            message = 'Ваш доступ заблокирован. Обратитесь к администратору.';
          } else if (accessCheck.reason === 'pending_approval') {
            message = 'Ваш запрос на доступ ожидает подтверждения администратора.';
          }
          
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: message,
            redirect: accessCheck.reason === 'not_in_database' ? 'registration' : null
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Сохранение в Airtable
        let airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
        let method = 'POST';
        let requestBody;

        if (recordId) {
          // Обновление существующей записи
          method = 'PATCH';
          requestBody = JSON.stringify({
            records: [{
              id: recordId,
              fields: userData
            }]
          });
        } else {
          // Создание новой записи
          requestBody = JSON.stringify({
            records: [{
              fields: userData
            }]
          });
        }

        console.log('Sending to Airtable:', method, airtableUrl, requestBody);

        const response = await fetch(airtableUrl, {
          method: method,
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: requestBody
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Airtable save error:', response.status, errorText);
          return new Response(JSON.stringify({ 
            error: 'Airtable Error', 
            message: `Failed to save to Airtable: ${response.status}`,
            details: errorText
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await response.json();
        console.log('Airtable save response:', JSON.stringify(data));

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 📝 POST /registration или /api/register - Регистрация нового пользователя
      // ============================================
      if (request.method === 'POST' && (path === '/registration' || path === '/api/register')) {
        console.log('POST /registration - New user registration');
        
        const body = await request.json();
        const { chat_id, username, first_name, last_name } = body;
        
        if (!chat_id) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'chat_id is required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Проверяем, есть ли уже запись в таблице Пользователи
        const checkUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('Пользователи')}?filterByFormula={chat_id}=${chat_id}`;
        const checkResponse = await fetch(checkUrl, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        if (!checkResponse.ok) {
          return new Response(JSON.stringify({ 
            error: 'Airtable Error',
            message: 'Failed to check existing registration' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const checkData = await checkResponse.json();
        
        // Если запись уже существует
        if (checkData.records && checkData.records.length > 0) {
          const existingStatus = checkData.records[0].fields['Статус доступа'];
          return new Response(JSON.stringify({ 
            error: 'Already Registered',
            message: `Ваша заявка уже существует со статусом: ${existingStatus}`,
            status: existingStatus
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Создаем новую запись в таблице Пользователи
        const createUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('Пользователи')}`;
        
        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'chat_id': parseInt(chat_id),
              '@username': username || '',
              'FirstName': first_name || '',
              'LastName': last_name || '',
              'Role': 'USER',
              'Статус доступа': 'Pending',
              'RegistrationDate': new Date().toISOString()
            }
          })
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('Failed to create user record:', errorText);
          return new Response(JSON.stringify({ 
            error: 'Airtable Error',
            message: 'Failed to create registration request' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const createdRecord = await createResponse.json();
        console.log('User record created:', createdRecord.id);

        // Отправляем уведомление админу через n8n webhook
        if (N8N_WEBHOOK_URL) {
          const fullName = [first_name, last_name].filter(n => n).join(' ') || 'Не указано';
          
          await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'new_registration',
              chat_id: chat_id,
              username: username,
              first_name: first_name,
              last_name: last_name,
              full_name: fullName,
              record_id: createdRecord.id
            })
          }).catch(err => console.error('Failed to notify n8n:', err));
        }

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Заявка успешно отправлена! Ожидайте одобрения администратора.',
          recordId: createdRecord.id
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 404 для остальных путей
      // ============================================
      console.log('404 - Path not found:', path);
      return new Response(JSON.stringify({ 
        error: 'Not Found',
        message: `Path ${path} not found. Available endpoints: GET/POST /profile, POST /registration` 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error.message, error.stack);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};