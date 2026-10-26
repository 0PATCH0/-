const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('закрыть')
        .setDescription('Запретить писать сообщения в этот канал'),

    async execute(interaction) {
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        let hasCustomPerm = false;
        
        const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
        if (guildSettings && guildSettings.modRoles) {
            hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
        }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав!', ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        await interaction.reply({ content: '🔒 Канал закрыт! Теперь писать могут только модераторы.' });
    },
};
