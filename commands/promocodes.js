const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { JSDOM } = require('jsdom');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('промокоды')
        .setDescription('Показать актуальные промокоды для Where Winds Meet (видно только вам)'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const response = await fetch('https://wwmcodex.com/active');
            const html = await response.text();
            const dom = new JSDOM(html);
            const document = dom.window.document;

            const codes = [];
            const rows = document.querySelectorAll('.active-codes-table tr');
            rows.forEach(row => {
                const codeElement = row.querySelector('td.code');
                const rewardElement = row.querySelector('td.reward');
                if (codeElement) {
                    codes.push({
                        code: codeElement.textContent.trim(),
                        reward: rewardElement ? rewardElement.textContent.trim() : 'Награда не указана'
                    });
                }
            });

            if (codes.length === 0) {
                return interaction.editReply({ content: '😕 Не удалось найти активные промокоды. Попробуйте позже.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('📜 Актуальные промокоды Where Winds Meet')
                .setColor('#d4af37')
                .setDescription('Нажмите на код ниже, чтобы скопировать его. Затем активируйте в игре: `Настройки -> Другое -> Обменять код`')
                .setFooter({ text: 'Данные обновляются автоматически с wwmcodex.com' })
                .setTimestamp();

            // Разбиваем на поля по 5 кодов, чтобы не превысить лимит
            for (let i = 0; i < codes.length; i += 5) {
                const chunk = codes.slice(i, i + 5);
                const fieldValue = chunk.map(c => 
                    `\`\`\`\n${c.code}\n\`\`\` — ${c.reward}`
                ).join('\n');
                
                embed.addFields({ 
                    name: i === 0 ? 'Активные коды' : '', 
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
