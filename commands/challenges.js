const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Challenge } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('вызовы')
        .setDescription('Показать активные вызовы на дуэли для этой гильдии'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;

        try {
            // Ищем вызовы, где гильдия либо вызывающая, либо оппонент, и статус не завершен/отклонен
            const challenges = await Challenge.find({
                $or: [ { challengerGuildId: guildId }, { opponentGuildId: guildId } ],
                status: { $in: ['pending', 'accepted', 'in_progress'] }
            }).sort({ time: 1 });

            if (challenges.length === 0) {
                return interaction.editReply({ content: '📭 На данный момент у вашей гильдии нет активных вызовов.' });
            }

            const embeds = challenges.slice(0, 5).map(ch => {
                const isChallenger = ch.challengerGuildId === guildId;
                const opponentName = isChallenger ? 'Оппонент' : 'Вызывающий'; // Упрощенно, так как нет доступа к названию другой гильдии без клиента
                
                let statusText = '';
                let color = '#f1c40f';
                if (ch.status === 'pending') statusText = '⏳ Ожидает ответа';
                if (ch.status === 'accepted') { statusText = '✅ Принят (выбор составов)'; color = '#2ecc71'; }
                if (ch.status === 'in_progress') { statusText = '⚔️ Бои идут'; color = '#e67e22'; }

                const timeUnix = Math.floor(ch.time);
                
                return new EmbedBuilder()
                    .setTitle('⚔️ Активный вызов')
                    .setColor(color)
                    .addFields(
                        { name: '📜 Статус', value: statusText, inline: true },
                        { name: '🕒 Время', value: `<t:${timeUnix}:F>`, inline: true },
                        { name: '🎯 Формат', value: `${ch.format} ${ch.format == 1 ? 'бой' : 'боёв'}`, inline: false }
                    )
                    .setFooter({ text: `ID: ${ch._id}` });
            });

            // Кнопки для перехода на сайт
            const buttons = challenges.slice(0, 5).map((ch, i) => {
                return new ButtonBuilder()
                    .setLabel(`Открыть вызов #${i + 1}`)
                    .setURL('https://patchitos1234.fly.dev/duel/' + ch._id)
                    .setStyle(ButtonStyle.Link);
            });

            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
            }

            await interaction.editReply({ 
                content: `🗡️ Найдено активных вызовов: **${challenges.length}**`, 
                embeds: embeds, 
                components: rows 
            });

        } catch (e) {
            console.error('CHALLENGES CMD:', e);
            await interaction.editReply({ content: '❌ Ошибка при загрузке вызовов.' });
        }
    }
};
