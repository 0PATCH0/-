const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('анмут')
        .setDescription('Снять мут с пользователя')
        .addUserOption(option => option.setName('пользователь').setDescription('С кого снять мут?').setRequired(true)),

    async execute(interaction) {
        // 1. Проверка прав
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
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

        const targetUser = interaction.options.getUser('пользователь');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({ content: 'Этот пользователь не находится в муте.', ephemeral: true });
        }

        try {
            // Снимаем мут
            await targetMember.timeout(null);

            // 2. Запись в логи
            await Log.create({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                username: interaction.user.tag,
                action: 'Анмут',
                details: `Снял мут с ${targetUser.tag}`
            });

            const embed = new EmbedBuilder()
                .setTitle('🔊 Мут снят')
                .setColor('#2ECC71')
                .setDescription(`С пользователя <@${targetUser.id}> был снят мут.\nМодератор: <@${interaction.user.id}>`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Не удалось снять мут. Проверьте права бота.', ephemeral: true });
        }
    },
};
