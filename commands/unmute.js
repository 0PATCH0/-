const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('анмут')
        .setDescription('Снять мут с пользователя')
        .addUserOption(option => option.setName('пользователь').setDescription('С кого снять мут?').setRequired(true)),

    async execute(interaction) {
        // Проверка прав
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
        let hasCustomPerm = false;
        
        const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
        if (guildSettings && guildSettings.modRoles) {
            hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
        }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('пользователь');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({ content: 'Этот пользователь не находится в муте.', ephemeral: true });
        }

        await targetMember.timeout(null);

        const embed = new EmbedBuilder()
            .setTitle('🔊 Мут снят')
            .setColor('#57F287')
            .setDescription(`С пользователя <@${targetUser.id}> был снят мут.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
