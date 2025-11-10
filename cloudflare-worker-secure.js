// Cloudflare Worker для Rocky Bot - Production версия
// ============================================
// 🔐 СИСТЕМА БЕЗОПАСНОСТИ (Упрощенная версия v1.0)
// ============================================
// 
// Включает:
// ✅ Whitelist - контроль доступа через таблицу Airtable
// ✅ Rate Limiting - защита от спама (30 запросов/минуту)
// ⚠️  Без валидации Telegram initData (будет добавлено в v2.0)
//
// Для production использования рекомендуется:
// 1. Настроить KV namespace для Rate Limiting
// 2. Регулярно проверять таблицу Whitelist
// 3. Мониторить логи Cloudflare Worker
// ============================================

// Проверка whitelist пользователя
async function checkWhitelist(chatId, airtableToken, baseId) {
  const whitelistTable = 'Whitelist';
  const formula = `{chat_id}=${chatId}`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(whitelistTable)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  try {
    console.log('Checking whitelist for chat_id:', chatId);
    console.log('Whitelist URL:', url);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    });
    
    const data = await response.json();
    console.log('Whitelist response:', JSON.stringify(data));
    
    if (!data.records || data.records.length === 0) {
      console.log('User not found in whitelist');
      return { approved: false, reason: 'not_in_whitelist' };
    }
    
    const status = data.records[0].fields['Status'];
    console.log('User status in whitelist:', status, 'Type:', typeof status);
    
    if (status === 'Approved') {
      console.log('User approved!');
      return { approved: true };
    } else if (status === 'Blocked') {
      console.log('User blocked!');
      return { approved: false, reason: 'blocked' };
    } else {
      console.log('User pending approval. Status value:', status);
      return { approved: false, reason: 'pending_approval' };
    }
  } catch (error) {
    console.error('Whitelist check error:', error);
    return { approved: false, reason: 'error' };
  }
}

// Rate Limiting с использованием KV
async function checkRateLimit(chatId, kvNamespace) {
  if (!kvNamespace) return true; // Если KV не настроено, пропускаем проверку
  
  const key = `rate_limit:${chatId}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 минута
  const maxRequests = 30; // Максимум 30 запросов в минуту
  
  try {
    const data = await kvNamespace.get(key, { type: 'json' });
    
    if (!data) {
      await kvNamespace.put(key, JSON.stringify({ count: 1, resetTime: now + windowMs }), {
        expirationTtl: 60
      });
      return true;
    }
    
    if (now > data.resetTime) {
      await kvNamespace.put(key, JSON.stringify({ count: 1, resetTime: now + windowMs }), {
        expirationTtl: 60
      });
      return true;
    }
    
    if (data.count >= maxRequests) {
      return false;
    }
    
    await kvNamespace.put(key, JSON.stringify({ count: data.count + 1, resetTime: data.resetTime }), {
      expirationTtl: 60
    });
    return true;
  } catch (error) {
    console.error('Rate limit error:', error);
    return true;
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
    const RATE_LIMIT_KV = env.RATE_LIMIT_KV; // KV namespace (опционально)

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
      // GET /profile - Получение данных профиля
      if (path === '/profile' && request.method === 'GET') {
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

        // 🔐 Проверка Whitelist
        const whitelistCheck = await checkWhitelist(chatId, AIRTABLE_TOKEN, BASE_ID);
        
        if (!whitelistCheck.approved) {
          let message = 'Доступ запрещен';
          if (whitelistCheck.reason === 'not_in_whitelist') {
            message = 'Вы не авторизованы. Обратитесь к администратору.';
          } else if (whitelistCheck.reason === 'blocked') {
            message = 'Ваш доступ заблокирован. Обратитесь к администратору.';
          } else if (whitelistCheck.reason === 'pending_approval') {
            message = 'Ваш запрос на доступ ожидает подтверждения администратора.';
          }
          
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: message 
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // 🔐 Rate Limiting
        const rateLimitOk = await checkRateLimit(chatId, RATE_LIMIT_KV);
        
        if (!rateLimitOk) {
          return new Response(JSON.stringify({ 
            error: 'Too Many Requests', 
            message: 'Превышен лимит запросов. Попробуйте позже.' 
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

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

      // POST /profile - Сохранение данных профиля
      if (path === '/profile' && request.method === 'POST') {
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

        // 🔐 Проверка Whitelist
        const whitelistCheck = await checkWhitelist(chatId, AIRTABLE_TOKEN, BASE_ID);
        
        if (!whitelistCheck.approved) {
          let message = 'Доступ запрещен';
          if (whitelistCheck.reason === 'not_in_whitelist') {
            message = 'Вы не авторизованы. Обратитесь к администратору.';
          } else if (whitelistCheck.reason === 'blocked') {
            message = 'Ваш доступ заблокирован. Обратитесь к администратору.';
          } else if (whitelistCheck.reason === 'pending_approval') {
            message = 'Ваш запрос на доступ ожидает подтверждения администратора.';
          }
          
          return new Response(JSON.stringify({ 
            error: 'Access Denied', 
            message: message 
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // 🔐 Rate Limiting
        const rateLimitOk = await checkRateLimit(chatId, RATE_LIMIT_KV);
        
        if (!rateLimitOk) {
          return new Response(JSON.stringify({ 
            error: 'Too Many Requests', 
            message: 'Превышен лимит запросов. Попробуйте позже.' 
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

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

      // POST /registration - Регистрация нового пользователя
      if (request.method === 'POST' && path === '/registration') {
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

        // Проверяем, есть ли уже запись в Whitelist
        const checkUrl = `https://api.airtable.com/v0/${env.BASE_ID}/Whitelist?filterByFormula={Chat ID}='${chat_id}'`;
        const checkResponse = await fetch(checkUrl, {
          headers: {
            'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
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
          const existingStatus = checkData.records[0].fields['Status'];
          return new Response(JSON.stringify({ 
            error: 'Already Registered',
            message: `Ваша заявка уже существует со статусом: ${existingStatus}`,
            status: existingStatus
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Создаем новую запись в Whitelist
        const createUrl = `https://api.airtable.com/v0/${env.BASE_ID}/Whitelist`;
        
        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Chat ID': String(chat_id),
              'Username': username || '',
              'Status': 'Pending'
            }
          })
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('Failed to create Whitelist record:', errorText);
          return new Response(JSON.stringify({ 
            error: 'Airtable Error',
            message: 'Failed to create registration request' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const createdRecord = await createResponse.json();
        console.log('Whitelist record created:', createdRecord.id);

        // Отправляем уведомление админу
        const fullName = [first_name, last_name].filter(n => n).join(' ') || 'Не указано';
        const notificationText = `🔔 *Новая заявка на регистрацию*\n\n` +
          `👤 *Пользователь:* ${fullName}\n` +
          `🆔 *ID:* \`${chat_id}\`\n` +
          `📝 *Username:* @${username || 'не указан'}\n\n` +
          `Одобрить или отклонить заявку?`;

        const adminChatId = '182719187'; // Ваш chat_id
        const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
        
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminChatId,
            text: notificationText,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Одобрить', callback_data: `approve_${chat_id}_${createdRecord.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${chat_id}_${createdRecord.id}` }
              ]]
            }
          })
        });

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Заявка успешно отправлена! Ожидайте одобрения администратора.',
          recordId: createdRecord.id
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // POST /registration/approve - Одобрение/отклонение заявки
      if (request.method === 'POST' && path === '/registration/approve') {
        console.log('POST /registration/approve - Admin approval');
        
        const body = await request.json();
        const { chat_id, record_id, action, admin_id } = body;
        
        if (!chat_id || !record_id || !action) {
          return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'chat_id, record_id and action are required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Определяем новый статус
        const newStatus = action === 'approve' ? 'Approved' : 'Blocked';

        // Обновляем запись в Whitelist
        const updateUrl = `https://api.airtable.com/v0/${env.BASE_ID}/Whitelist/${record_id}`;
        const updateFields = {
          'Status': newStatus
        };

        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields: updateFields })
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('Failed to update Whitelist record:', errorText);
          return new Response(JSON.stringify({ 
            error: 'Airtable Error',
            message: 'Failed to update registration status' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const updatedRecord = await updateResponse.json();
        console.log('Whitelist record updated:', updatedRecord.id, 'Status:', newStatus);

        // Отправляем уведомление пользователю
        const userMessage = action === 'approve' 
          ? '✅ Ваша заявка одобрена! Теперь вы можете пользоваться ботом.' 
          : '❌ Ваша заявка отклонена администратором.';

        const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chat_id,
            text: userMessage
          })
        });

        return new Response(JSON.stringify({ 
          success: true,
          message: `Registration ${action === 'approve' ? 'approved' : 'rejected'}`,
          status: newStatus
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 404 для остальных путей
      console.log('404 - Path not found:', path);
      return new Response(JSON.stringify({ 
        error: 'Not Found',
        message: `Path ${path} not found` 
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
