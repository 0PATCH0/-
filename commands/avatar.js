const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('аватар')
        .setDescription('Показать аватар пользователя в полном размере')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Чей аватар показать? (по умолчанию - ваш)')
                .setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('пользователь') || interaction.user;
        
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ Аватар ${user.username}`)
            .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setColor('#5865F2');

        await interaction.reply({ embeds: [embed] });
    },
};
