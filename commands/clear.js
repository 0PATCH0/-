const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('очистить')
        .setDescription('Удалить сообщения в текущем канале')
        .addIntegerOption(option => 
            option.setName('количество')
                .setDescription('Сколько сообщений удалить? (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),

    async execute(interaction) {
        // 1. Проверка прав
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        let hasCustomPerm = false;
        
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        } catch (e) { console.error(e); }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        const amount = interaction.options.getInteger('количество');

        try {
            // Удаляем сообщения
            const deleted = await interaction.channel.bulkDelete(amount, true);

            // 2. Запись в логи
            await Log.create({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                username: interaction.user.tag,
                action: 'Очистка чата',
                details: `Удалил ${deleted.size} сообщений в канале #${interaction.channel.name}`
            });

            // Ответ (невидимый для всех)
            await interaction.reply({ content: `🧹 Успешно удалено **${deleted.size}** сообщений.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Не удалось удалить сообщения. Возможно, они старше 14 дней.', ephemeral: true });
        }
    },
};
