const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { JSDOM } = require('jsdom');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('промокоды')
        .setDescription('Показать актуальные промокоды для Where Winds Meet (видно только вам)'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Запрашиваем страницу с кодами с сайта yar.gg
            const response = await fetch('https://codes.yar.gg/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error('Сайт недоступен');
            
            const html = await response.text();
            const dom = new JSDOM(html);
            const document = dom.window.document;

            const codes = new Set();

            // Умный поиск: берем весь текст со страницы и ищем комбинации из 8-15 заглавных букв/цифр
            // (так как промокоды обычно выглядят как QMNCQJKXRF или WD7H83YK7Y)
            const pageText = document.body.textContent || "";
            const regex = /\b[A-Z0-9]{8,15}\b/g;
            let match;
            
            while ((match = regex.exec(pageText)) !== null) {
                const code = match[0];
                // Отсеиваем случайные слова (чтобы код содержал хотя бы 3 цифры или был очень длинным)
                const digitCount = (code.match(/\d/g) || []).length;
                if (digitCount >= 2 || code.length >= 12) {
                    codes.add(code);
                }
            }

            // Превращаем Set обратно в массив
            const uniqueCodes = Array.from(codes);

            if (uniqueCodes.length === 0) {
                return interaction.editReply({ content: '😕 Не удалось найти активные промокоды. Возможно, сайт обновился. Попробуйте позже.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('📜 Актуальные промокоды Where Winds Meet')
                .setColor('#d4af37')
                .setDescription('Нажмите на код ниже, чтобы скопировать его. Затем активируйте в игре:\n`Настройки -> Другое -> Обменять код`\n\n*(Данные взяты с codes.yar.gg)*')
                .setFooter({ text: 'Данные обновляются автоматически' })
                .setTimestamp();

            // Разбиваем на поля по 5 кодов
            for (let i = 0; i < uniqueCodes.length; i += 5) {
                const chunk = uniqueCodes.slice(i, i + 5);
                const fieldValue = chunk.map(code => 
                    `\`\`\`\n${code}\n\`\`\``
                ).join('\n');
                
                embed.addFields({ 
                    name: i === 0 ? 'Активные коды' : '​', 
                    value: fieldValue, 
                    inline: false 
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Ошибка при получении промокодов:', error);
            await interaction.editReply({ content: '⚠️ Произошла ошибка при загрузке промокодов. Попробуйте позже.' });
        }
    }
};
