const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('анмут')
        .setDescription('Снять мут с пользователя')
        .addUserOption(option => option.setName('пользователь').setDescription('С кого снять мут?').setRequired(true)),

    async execute(interaction) {
        // 1. Проверка стандартных прав Discord (Управление участниками)
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
        
        // 2. Проверка кастомных прав из БД (Мастер гильдии, Старейшина и т.д.)
        let hasCustomPerm = false;
        let customRolesIds = [];
        
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                customRolesIds = guildSettings.modRoles;
                hasCustomPerm = interaction.member.roles.cache.some(role => customRolesIds.includes(role.id));
            }
        } catch (e) {
            console.error("Ошибка при чтении БД:", e);
        }

        // Отладка в консоль Fly.io (если что-то не работает, ты увидишь это в логах)
        console.log(`[UNMUTE DEBUG] Пользователь: ${interaction.user.tag}`);
        console.log(`[UNMUTE DEBUG] Есть права Discord: ${hasDiscordPerm}`);
        console.log(`[UNMUTE DEBUG] Есть кастомные права: ${hasCustomPerm}`);

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        // --- ЛОГИКА СНЯТИЯ МУТА ---
        const targetUser = interaction.options.getUser('пользователь');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({ content: 'Этот пользователь не находится в муте.', ephemeral: true });
        }

        try {
            await targetMember.timeout(null);

            // Запись в логи для сайта
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
