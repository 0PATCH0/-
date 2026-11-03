const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('промокоды')
        .setDescription('Показать актуальные промокоды для Where Winds Meet (видно только вам)'),

    async execute(interaction) {
        // Откладываем ответ, так как запрос к API занимает время
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Запрашиваем данные напрямую из API сайта yar.gg
            const response = await fetch('https://codes.yar.gg/api/codes');
            if (!response.ok) throw new Error('API недоступен');
            
            const data = await response.json();
            
            // Берем только активные коды
            const activeCodes = data.active || [];

            if (activeCodes.length === 0) {
                return interaction.editReply({ content: '😕 Сейчас нет активных промокодов. Попробуйте позже.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('📜 Актуальные промокоды Where Winds Meet')
                .setColor('#d4af37')
                .setDescription('Нажмите на код ниже, чтобы скопировать его. Затем активируйте в игре:\n`Настройки -> Другое -> Обменять код`\n\n*(Данные взяты с codes.yar.gg)*')
                .setFooter({ text: `Обновлено: ${new Date(data.updatedAt).toLocaleString('ru-RU')}` })
                .setTimestamp();

            // Разбиваем на поля по 5 кодов, чтобы не превысить лимит Discord (1024 символа)
            for (let i = 0; i < activeCodes.length; i += 5) {
                const chunk = activeCodes.slice(i, i + 5);
                // Оборачиваем каждый код в ``` для кнопки "Копировать"
                const fieldValue = chunk.map(c => 
                    `\`\`\`\n${c.code}\n\`\`\``
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
            await interaction.editReply({ content: '⚠️ Произошла ошибка при загрузке промокодов. Возможно, сайт временно недоступен.' });
        }
    }
};
