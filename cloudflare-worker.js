// Cloudflare Worker для безопасной работы с Airtable API
export default {
  async fetch(request, env) {
    // ⚠️ НАСТРОЙКИ AIRTABLE - ЗАМЕНИТЕ НА СВОИ ЗНАЧЕНИЯ
    const AIRTABLE_TOKEN = 'YOUR_AIRTABLE_PERSONAL_ACCESS_TOKEN';
    const BASE_ID = 'YOUR_BASE_ID';
    const TABLE_NAME = 'Пользователи';

    // CORS заголовки
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Обработка preflight запросов
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET /profile - Получение данных профиля
      if (path === '/profile' && request.method === 'GET') {
        const chatId = url.searchParams.get('chat_id');
        if (!chatId) {
          return new Response(JSON.stringify({ error: 'chat_id is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const formula = `{chat_id}="${chatId}"`;
        const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;

        const response = await fetch(airtableUrl, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
        });

        const data = await response.json();
        const record = data.records[0] || { fields: {} };

        return new Response(JSON.stringify(record), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // POST /profile - Сохранение данных профиля
      if (path === '/profile' && request.method === 'POST') {
        const body = await request.json();
        const { recordId, userData } = body;

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
