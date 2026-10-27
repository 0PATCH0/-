const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');
module.exports = {
    data: new SlashCommandBuilder().setName('закрыть').setDescription('Закрыть канал'),
    async execute(interaction) {
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        const settings = await Settings.findOne({ guildId: interaction.guild.id });
        const hasCustom = settings && settings.modRoles && interaction.member.roles.cache.some(r => settings.modRoles.includes(r.id));
        
        if (!hasPerm && !hasCustom) return interaction.reply({ content: 'Нет прав!', ephemeral: true });

        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        
        await Log.create({ guildId: interaction.guild.id, userId: interaction.user.id, username: interaction.user.tag, action: 'Закрытие канала', details: `Закрыл #${interaction.channel.name}` });
        await interaction.reply({ content: '🔒 Канал закрыт!' });
    }
};
