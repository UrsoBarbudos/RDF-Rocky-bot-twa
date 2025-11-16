document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.ready();

    const usernameDisplay = document.getElementById('username-display');
    const eventFeed = document.getElementById('event-feed');
    const addCallBtn = document.getElementById('add-call-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');

    let chatId;

    // 1. Инициализация и получение данных
    async function initialize() {
        try {
            // Для локального тестирования
            if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
                 console.warn("Telegram user data not found. Falling back to test data.");
                chatId = '123456789'; // ID для теста
                await loadUserInfo('testuser');
            } else {
                chatId = tg.initDataUnsafe.user.id;
                await loadUserInfo(tg.initDataUnsafe.user.username);
            }
            
            await loadEvents();
            
        } catch (error) {
            console.error("Initialization failed:", error);
            eventFeed.innerHTML = `<p style="color: red;">Ошибка загрузки данных: ${error.message}</p>`;
        }
    }

    // 2. Загрузка информации о пользователе
    async function loadUserInfo(username) {
        if (!username) {
            usernameDisplay.textContent = 'Пользователь';
            return;
        }
        usernameDisplay.textContent = `@${username}`;
    }

    // 3. Загрузка событий с сервера
    async function loadEvents() {
        if (!chatId) return;

        eventFeed.innerHTML = '<p>Загрузка событий...</p>';
        
        try {
            const response = await fetch(`/api/events?chat_id=${chatId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Не удалось загрузить события.');
            }
            const { data } = await response.json();
            renderEvents(data);
        } catch (error) {
            console.error("Failed to load events:", error);
            eventFeed.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    // 4. Рендеринг событий в DOM
    function renderEvents(events) {
        if (!events || events.length === 0) {
            eventFeed.innerHTML = '<p>Событий пока нет.</p>';
            return;
        }

        eventFeed.innerHTML = events.map(event => {
            const fields = event.fields;
            const type = fields['Event Type'];
            const title = fields['Title'];
            const timestamp = new Date(fields['Timestamp']).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const cardClass = type === 'Вызывной' ? 'call' : 'expense';
            const icon = type === 'Вызывной' ? '📞' : '💰';

            return `
                <div class="event-card ${cardClass}">
                    <div class="event-header">
                        <span class="event-icon">${icon}</span>
                        <span class="event-time">${timestamp}</span>
                    </div>
                    <div class="event-content">
                        <h3>${title}</h3>
                        ${renderEventDetails(fields)}
                    </div>
                </div>`;
        }).join('');
    }
    
    // Вспомогательная функция для рендеринга деталей
    function renderEventDetails(fields) {
        if (fields['Event Type'] === 'Расход' && fields['Description']) {
            return `<p class="expense-description">${fields['Description']}</p>`;
        }
        return '';
    }
    
    // 5. Создание нового вызывного
    async function createCall() {
        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventType: 'Вызывной', chat_id: chatId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Не удалось создать вызывной.');
            }
            tg.HapticFeedback.notificationOccurred('success');
            await loadEvents(); // Обновляем ленту
        } catch (error) {
            console.error("Failed to create call:", error);
            tg.showAlert(error.message);
        }
    }

    // 6. Создание нового расхода
    function createExpense() {
        tg.showPopup({
            title: 'Добавить расход',
            message: 'Введите сумму и описание.',
            buttons: [{ type: 'default', text: 'Сохранить', id: 'save_expense' }],
        }, async (buttonId) => {
            if (buttonId === 'save_expense') {
                // Это мок, в реальности нужно использовать поля ввода из webapp
                const amount = parseFloat(prompt("Сумма:", "0"));
                const description = prompt("Описание:");

                if (isNaN(amount) || amount <= 0) {
                    tg.showAlert('Сумма должна быть положительным числом.');
                    return;
                }

                try {
                    const response = await fetch('/api/events', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            eventType: 'Расход',
                            chat_id: chatId,
                            amount: amount,
                            description: description
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Не удалось создать расход.');
                    }
                    tg.HapticFeedback.notificationOccurred('success');
                    await loadEvents();
                } catch (error) {
                    console.error("Failed to create expense:", error);
                    tg.showAlert(error.message);
                }
            }
        });
    }

    // Назначение обработчиков
    addCallBtn.addEventListener('click', createCall);
    addExpenseBtn.addEventListener('click', createExpense);

    // Запуск
    initialize();
});