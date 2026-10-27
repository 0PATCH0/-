const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('открыть')
        .setDescription('Разрешить писать сообщения в этот канал'),

    async execute(interaction) {
        // 1. Проверка прав
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        let hasCustomPerm = false;
        
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        } catch (e) { console.error(e); }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав!', ephemeral: true });
        }

        try {
            // Открываем канал для everyone
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });

            // 2. Запись в логи
            await Log.create({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                username: interaction.user.tag,
                action: 'Открытие канала',
                details: `Открыл канал #${interaction.channel.name}`
            });

            const embed = new EmbedBuilder()
                .setTitle('🔓 Канал открыт')
                .setDescription(`Канал был открыт модератором <@${interaction.user.id}>.\nВсе снова могут писать.`)
                .setColor('#2ECC71')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Ошибка. Проверьте права бота в канале.', ephemeral: true });
        }
    },
};
