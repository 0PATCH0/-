const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { WordleLobby } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('вордл')
        .setDescription('Создать лобби для игры «Свиток Иероглифов»')
        .addIntegerOption(option =>
            option.setName('длина')
                .setDescription('Количество букв в слове (4, 5, 6 или 7)')
                .setRequired(false)
                .addChoices(
                    { name: '4 буквы (5 попыток)', value: 4 },
                    { name: '5 букв (6 попыток)', value: 5 },
                    { name: '6 букв (7 попыток)', value: 6 },
                    { name: '7 букв (8 попыток)', value: 7 }
                )
        ),

    async execute(interaction) {
        try {
            const chosenLength = interaction.options.getInteger('длина') || 5;
            const attempts = chosenLength + 1;

            const lobby = await WordleLobby.create({
                channelId: interaction.channelId,
                guildId: interaction.guildId,
                hostId: interaction.user.id,
                status: 'waiting',
                mode: 'race',
                wordLength: chosenLength,
                maxAttempts: attempts,
                totalRounds: 1,
                players: [{ userId: interaction.user.id, name: interaction.user.username }]
            });

            const siteUrl = `https://patchitos1234.fly.dev/wordle/lobby/${lobby._id}`;

            const embed = new EmbedBuilder()
                .setTitle('📜 Свиток Иероглифов')
                .setDescription(`Лобби создано!\n\n👑 **Хост:** <@${interaction.user.id}>\n👥 **Игроков:** 1\n🔤 **Режим:** ${chosenLength} букв / ${attempts} попыток\n\nНажмите кнопку ниже, чтобы присоединиться к гонке.`)
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
