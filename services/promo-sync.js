const { PromoCode } = require('../models');
const cron = require('node-cron');

async function fetchCodesFromModWWM() {
    try {
        const response = await fetch('https://modwwm.com/database/codes/index.html', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await response.text();
        
        // Простой regex: ищем комбинации из заголовных букв и цифр длиной от 8 до 16 символов
        const codeRegex = /\b[A-Z0-9]{8,16}\b/g;
        const matches = html.match(codeRegex) || [];
        
        // Убираем дубликаты
        const foundCodes = [...new Set(matches)];

        if (foundCodes.length === 0) {
            console.warn('[PROMO] Коды не найдены на сайте. Возможно, изменилась структура.');
            return;
        }

        // Шаг 1: Помечаем ВСЕ коды в базе как expired
        await PromoCode.updateMany({}, { status: 'expired' });

        // Шаг 2: Коды, которые нашли сейчас, делаем активными
        for (const code of foundCodes) {
            await PromoCode.findOneAndUpdate(
                { code: code },
                { status: 'active', updatedAt: new Date(), source: 'modwwm' },
                { upsert: true }
            );
        }
        console.log(`[PROMO] Успешно синхронизировано ${foundCodes.length} активных кодов.`);
    } catch (error) {
        console.error('[PROMO] Ошибка при парсинге modwwm:', error.message);
    }
}

function startPromoSync() {
    // Запускаем каждый час в 0 минут
    cron.schedule('0 * * * *', () => {
        console.log('[PROMO] Запуск плановой синхронизации по расписанию...');
        fetchCodesFromModWWM();
    });
    
    // Первый запуск сразу при старте бота, чтобы база не была пустой
    console.log('[PROMO] Первичная загрузка кодов...');
    fetchCodesFromModWWM();
}

module.exports = { startPromoSync };
