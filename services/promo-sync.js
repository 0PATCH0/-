const { PromoCode } = require('../models');
const cron = require('node-cron');
const { JSDOM } = require('jsdom');

async function fetchCodesFromModWWM() {
    try {
        const response = await fetch('https://modwwm.com/database/codes/index.html', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const activeSection = document.querySelector('.copy-codes-will-copy') || document.body;
        const codeRegex = /\b[A-Z0-9]{8,16}\b/g;
        const text = activeSection.textContent || '';
        const foundCodes = [...new Set(text.match(codeRegex) || [])];

        if (foundCodes.length === 0) {
            console.warn('[PROMO] Коды не найдены, пропускаем обновление.');
            return;
        }

        await PromoCode.updateMany({}, { status: 'expired' });

        for (const code of foundCodes) {
            await PromoCode.findOneAndUpdate(
                { code: code },
                { status: 'active', updatedAt: new Date(), source: 'modwwm' },
                { upsert: true }
            );
        }
        console.log(`[PROMO] Синхронизировано ${foundCodes.length} активных кодов.`);
    } catch (error) {
        console.error('[PROMO] Ошибка при парсинге modwwm:', error.message);
    }
}

function startPromoSync() {
    cron.schedule('0 * * * *', () => {
        console.log('[PROMO] Запуск плановой синхронизации...');
        fetchCodesFromModWWM();
    });
    fetchCodesFromModWWM();
}

module.exports = { startPromoSync };
