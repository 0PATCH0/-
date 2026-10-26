const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('очистить')
        .setDescription('Удалить сообщения в чате')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option => 
            option.setName('количество').setDescription('Сколько сообщений удалить? (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

    async execute(interaction) {
        const amount = interaction.options.getInteger('количество');
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `🧹 Удалено **${amount}** сообщений.`, ephemeral: true });
    },
};
