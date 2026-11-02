const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { WordleLobby } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('вордл')
        .setDescription('Создать лобби для игры «Свиток Иероглифов»'),

    async execute(interaction) {
        try {
            // Создаем лобби в БД
            const lobby = await WordleLobby.create({
                channelId: interaction.channelId,
                guildId: interaction.guildId,
                hostId: interaction.user.id,
                status: 'waiting',
                mode: 'race',
                totalRounds: 1,
                players: [{ userId: interaction.user.id, name: interaction.user.username }]
            });

            const siteUrl = `https://patchitos1234.fly.dev/wordle/lobby/${lobby._id}`;

            const embed = new EmbedBuilder()
                .setTitle('📜 Свиток Иероглифов')
                .setDescription(`Лобби создано!\n\n👑 **Хост:** <@${interaction.user.id}>\n👥 **Игроков:** 1\n\nНажмите кнопку ниже, чтобы присоединиться к гонке.`)
                .setColor('#d4af37')
                .setFooter({ text: 'Where Winds Meet • Мини-игра' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('🎮 Присоединиться')
                    .setURL(siteUrl)
                    .setStyle(ButtonStyle.Link)
            );

            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            
            lobby.messageId = message.id;
            await lobby.save();

        } catch (e) {
            console.error('WORDLE CMD:', e);
            await interaction.reply({ content: '❌ Ошибка при создании лобби.', ephemeral: true });
        }
    }
};
