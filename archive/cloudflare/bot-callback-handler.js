/**
 * Telegram Bot Callback Handler
 * 
 * Этот скрипт обрабатывает нажатия на inline кнопки в уведомлениях регистрации.
 * Нужно настроить webhook для бота, который будет вызывать этот Worker.
 * 
 * Деплой: wrangler deploy bot-callback-handler.js --name rocky-bot-callback
 * Установка webhook: curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
 *                    -H "Content-Type: application/json" \
 *                    -d '{"url": "https://rocky-bot-callback.egordkd.workers.dev"}'
 */

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const update = await request.json();
      console.log('Telegram update:', JSON.stringify(update));

      // Обрабатываем callback_query
      if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const callbackData = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;
        const adminId = callbackQuery.from.id;

        console.log('Callback data:', callbackData);

        // Парсим callback_data: "approve_182719187_recXXXXXX" или "reject_182719187_recXXXXXX"
        const parts = callbackData.split('_');
        if (parts.length !== 3) {
          console.error('Invalid callback_data format:', callbackData);
          return new Response('OK', { status: 200 });
        }

        const action = parts[0]; // "approve" или "reject"
        const targetChatId = parts[1];
        const recordId = parts[2];

        // Вызываем API Worker для обновления статуса
        const apiUrl = 'https://rocky-bot-api.egordkd.workers.dev/registration/approve';
        const apiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            record_id: recordId,
            action: action,
            admin_id: String(adminId)
          })
        });

        const apiResult = await apiResponse.json();
        console.log('API response:', JSON.stringify(apiResult));

        // Отвечаем на callback query (убирает "часики" на кнопке)
        const answerUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`;
        const answerText = action === 'approve' ? '✅ Заявка одобрена' : '❌ Заявка отклонена';
        
        await fetch(answerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: answerText
          })
        });

        // Редактируем сообщение, убирая кнопки и добавляя статус
        const editUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
        const originalText = callbackQuery.message.text;
        const updatedText = originalText + `\n\n${answerText} администратором @${callbackQuery.from.username || adminId}`;

        await fetch(editUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: updatedText,
            parse_mode: 'Markdown'
          })
        });

        return new Response('OK', { 
          status: 200,
          headers: corsHeaders 
        });
      }

      // Для всех остальных типов обновлений просто возвращаем OK
      return new Response('OK', { 
        status: 200,
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Handler error:', error.message, error.stack);
      return new Response('OK', { 
        status: 200,
        headers: corsHeaders 
      });
    }
  }
};
