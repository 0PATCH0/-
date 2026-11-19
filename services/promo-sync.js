const { PromoCode } = require('../models');
const cron = require('node-cron'); // Потребуется установить: npm install node-cron

// Список источников для парсинга
const SOURCES = [
    { name: 'modwwm', url: 'https://modwwm.com/database/codes/index.html' },
    // Можно добавить сюда codes.yar.gg, если у него есть API
];

async function fetchAndParseModwwm() {
    try {
        const response = await fetch(SOURCES[0].url);
        const html = await response.text();
        
        // Простой парсинг: ищем коды в таблице. 
        // В реальности здесь нужен более надежный парсер (cheerio или jsdom)
        // Это лишь пример логики.
        const codeRegex = /<td><code>([A-Z0-9]{8,})<\/code><\/td>/g;
        const codes = [];
        let match;
        while ((match = codeRegex.exec(html)) !== null) {
            codes.push(match[1]);
        }
        
        // Обновляем базу: помечаем все старые коды как expired, добавляем новые
        await PromoCode.updateMany({ source: 'modwwm' }, { status: 'expired' });
        
        for (const code of codes) {
            await PromoCode.findOneAndUpdate(
                { code },
                { status: 'active', source: 'modwwm', updatedAt: new Date() },
                { upsert: true }
            );
        }
        console.log(`[PROMO] Синхронизировано ${codes.length} кодов с modwwm.`);
    } catch (e) {
        console.error('[PROMO] Ошибка парсинга modwwm:', e);
    }
}

// Запускаем синхронизацию каждый час
function startPromoSync() {
    cron.schedule('0 * * * *', () => {
        console.log('[PROMO] Запуск плановой синхронизации...');
        fetchAndParseModwwm();
        // Здесь можно добавить вызовы других источников
    });
    // Первый запуск при старте
    fetchAndParseModwwm();
}

module.exports = { startPromoSync };
