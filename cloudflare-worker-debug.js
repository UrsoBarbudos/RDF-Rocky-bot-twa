// Cloudflare Worker для Rocky Bot - Упрощенная безопасность
// ============================================
// 🔐 ФУНКЦИИ БЕЗОПАСНОСТИ
// ============================================

// Проверка whitelist пользователя
async function checkWhitelist(chatId, airtableToken, baseId) {
  const whitelistTable = 'Whitelist';
  const formula = `{chat_id}=${chatId}`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(whitelistTable)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    });
    
    const data = await response.json();
    
    if (!data.records || data.records.length === 0) {
      return { approved: false, reason: 'not_in_whitelist' };
    }
    
    const status = data.records[0].fields['Status'];
    
    if (status === 'Approved') {
      return { approved: true };
    } else if (status === 'Blocked') {
      return { approved: false, reason: 'blocked' };
    } else {
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
