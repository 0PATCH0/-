const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('вордл')
        .setDescription('Начать игру «Свиток Иероглифов» (Wordle)'),

    async execute(interaction) {
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        
        // Ссылка на игру с параметрами канала и пользователя
        const gameUrl = `https://patchitos1234.fly.dev/wordle?channel=${channelId}&user=${userId}`;

        const embed = new EmbedBuilder()
            .setTitle('📜 Свиток Иероглифов')
            .setDescription('Нажмите кнопку ниже, чтобы начать игру.\nУгадайте слово из 5 букв за 6 попыток.')
            .setColor('#d4af37')
            .setFooter({ text: 'Where Winds Meet • Мини-игра' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('🎮 Играть')
                .setURL(gameUrl)
                .setStyle(ButtonStyle.Link)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
