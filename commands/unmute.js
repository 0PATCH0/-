const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('анмут')
        .setDescription('Снять мут')
        .addUserOption(option => option.setName('пользователь').setDescription('С кого снять?').setRequired(true)),

    async execute(interaction) {
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
        let hasCustomPerm = false;
        const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
        if (guildSettings && guildSettings.modRoles) {
            hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
        }
        if (!hasDiscordPerm && !hasCustomPerm) return interaction.reply({ content: 'У вас нет прав!', ephemeral: true });

        const targetUser = interaction.options.getUser('пользователь');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        if (!targetMember.isCommunicationDisabled()) return interaction.reply({ content: 'Этот пользователь не в муте.', ephemeral: true });

        await targetMember.timeout(null);

        // ЛОГИРОВАНИЕ
        await Log.create({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            username: interaction.user.tag,
            action: 'Анмут',
            details: `Снял мут с ${targetUser.tag}`
        });

        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔊 Мут снят').setColor('#57F287').setDescription(`С <@${targetUser.id}> снят мут.`).setTimestamp()] });
    },
};
