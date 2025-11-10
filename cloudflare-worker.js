// Cloudflare Worker для безопасной работы с Airtable API
// ============================================
// 🔐 ФУНКЦИИ БЕЗОПАСНОСТИ
// ============================================

// Проверка подлинности Telegram initData
async function validateTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) return false;
    
    urlParams.delete('hash');
    
    // Создаем строку для проверки
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Создаем secret key
    const encoder = new TextEncoder();
    const secretKeyData = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
    
    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    // Подписываем данные
    const signature = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataCheckString)
    );
    
    // Конвертируем в hex
    const hexSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return hexSignature === hash;
  } catch (error) {
    console.error('Validation error:', error);
    return false;
  }
}

// Проверка whitelist пользователя
async function checkWhitelist(chatId, airtableToken, baseId) {
  const whitelistTable = 'Whitelist';
  const formula = `{chat_id}="${chatId}"`;
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
      // Первый запрос
      await kvNamespace.put(key, JSON.stringify({ count: 1, resetTime: now + windowMs }), {
        expirationTtl: 60
      });
      return true;
    }
    
    if (now > data.resetTime) {
      // Окно времени истекло, сбрасываем счетчик
      await kvNamespace.put(key, JSON.stringify({ count: 1, resetTime: now + windowMs }), {
        expirationTtl: 60
      });
      return true;
    }
    
    if (data.count >= maxRequests) {
      return false; // Превышен лимит
    }
    
    // Увеличиваем счетчик
    await kvNamespace.put(key, JSON.stringify({ count: data.count + 1, resetTime: data.resetTime }), {
      expirationTtl: 60
    });
    return true;
  } catch (error) {
    console.error('Rate limit error:', error);
    return true; // В случае ошибки пропускаем запрос
  }
}

// ============================================
// 🚀 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================

export default {
  async fetch(request, env) {
    // ⚠️ НАСТРОЙКИ - ЗАМЕНИТЕ НА СВОИ ЗНАЧЕНИЯ
    const AIRTABLE_TOKEN = env.AIRTABLE_TOKEN || 'YOUR_AIRTABLE_PERSONAL_ACCESS_TOKEN';
    const BASE_ID = env.BASE_ID || 'YOUR_BASE_ID';
    const BOT_TOKEN = env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
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

    try {
      // ============================================
      // 🔐 ПРОВЕРКА БЕЗОПАСНОСТИ
      // ============================================
      
      // 1. Проверка Telegram initData
      const initData = request.headers.get('X-Telegram-Init-Data');
      
      if (!initData) {
        return new Response(JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Missing Telegram authentication data' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const isValid = await validateTelegramWebAppData(initData, BOT_TOKEN);
      
      if (!isValid) {
        return new Response(JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Invalid Telegram authentication' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Получаем chat_id из initData
      const urlParams = new URLSearchParams(initData);
      const userDataJson = urlParams.get('user');
      if (!userDataJson) {
        return new Response(JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Invalid user data' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const userData = JSON.parse(userDataJson);
      const authenticatedChatId = userData.id.toString();
      
      // 2. Проверка Whitelist
      const whitelistCheck = await checkWhitelist(authenticatedChatId, AIRTABLE_TOKEN, BASE_ID);
      
      if (!whitelistCheck.approved) {
        let message = 'Access denied';
        if (whitelistCheck.reason === 'not_in_whitelist') {
          message = 'You are not authorized. Please contact the administrator.';
        } else if (whitelistCheck.reason === 'blocked') {
          message = 'Your access has been blocked. Contact the administrator for details.';
        } else if (whitelistCheck.reason === 'pending_approval') {
          message = 'Your access request is pending approval. Please wait for administrator confirmation.';
        }
        
        return new Response(JSON.stringify({ 
          error: 'Access Denied', 
          message: message 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // 3. Rate Limiting
      const rateLimitOk = await checkRateLimit(authenticatedChatId, RATE_LIMIT_KV);
      
      if (!rateLimitOk) {
        return new Response(JSON.stringify({ 
          error: 'Too Many Requests', 
          message: 'Rate limit exceeded. Please try again later.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ============================================
      // 📡 ОБРАБОТКА API ЗАПРОСОВ
      // ============================================
      
      // GET /profile - Получение данных профиля
      if (path === '/profile' && request.method === 'GET') {
        // Используем chat_id из проверенного initData (защита от подделки)
        const formula = `{chat_id}="${authenticatedChatId}"`;
        const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;

        const response = await fetch(airtableUrl, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
        });

        const data = await response.json();
        const record = data.records[0] || { fields: {}, isNewUser: true };

        return new Response(JSON.stringify(record), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // POST /profile - Сохранение данных профиля
      if (path === '/profile' && request.method === 'POST') {
        const body = await request.json();
        const { recordId, userData } = body;
        
        // Защита: Убеждаемся, что chat_id соответствует аутентифицированному пользователю
        if (userData.chat_id && userData.chat_id.toString() !== authenticatedChatId) {
          return new Response(JSON.stringify({ 
            error: 'Forbidden', 
            message: 'Cannot modify data for another user' 
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Гарантируем, что chat_id установлен правильно
        userData.chat_id = parseInt(authenticatedChatId);

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

        const response = await fetch(airtableUrl, {
          method: method,
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: requestBody
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 404 для остальных путей
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  }
};
