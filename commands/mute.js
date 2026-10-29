const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('мут')
        .setDescription('Выдать пользователю мут (тайм-аут)')
        .addUserOption(option => option.setName('пользователь').setDescription('Кого замутить?').setRequired(true))
        .addStringOption(option => option.setName('время').setDescription('Время (10m, 1h, 1d)').setRequired(true))
        .addStringOption(option => option.setName('причина').setDescription('Причина').setRequired(false)),

    async execute(interaction) {
        // 1. Проверка стандартных прав Discord
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
        
        // 2. Проверка кастомных прав из БД
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

        // Отладка в консоль Fly.io
        console.log(`[MUTE DEBUG] Пользователь: ${interaction.user.tag}`);
        console.log(`[MUTE DEBUG] Есть права Discord: ${hasDiscordPerm}`);
        console.log(`[MUTE DEBUG] Роли из БД: ${customRolesIds.join(', ')}`);
        console.log(`[MUTE DEBUG] Роли пользователя: ${interaction.member.roles.cache.map(r => r.id).join(', ')}`);
        console.log(`[MUTE DEBUG] Есть кастомные права: ${hasCustomPerm}`);

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        // --- ДАЛЬШЕ ИДЕТ ВЫДАЧА МУТА ---
        const targetUser = interaction.options.getUser('пользователь');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const timeStr = interaction.options.getString('время');
        const reason = interaction.options.getString('причина') || 'Причина не указана';

        if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: 'Вы не можете замутить человека с равной или высшей ролью!', ephemeral: true });
        }

        let ms = 0;
        if (timeStr.endsWith('m')) ms = parseInt(timeStr) * 60 * 1000;
        else if (timeStr.endsWith('h')) ms = parseInt(timeStr) * 60 * 60 * 1000;
        else if (timeStr.endsWith('d')) ms = parseInt(timeStr) * 24 * 60 * 60 * 1000;
        else return interaction.reply({ content: 'Неверный формат времени. 10m, 1h, 1d.', ephemeral: true });

        if (isNaN(ms) || ms > 2419200000) return interaction.reply({ content: 'Время до 28 дней!', ephemeral: true });

        await targetMember.timeout(ms, reason);

        await Log.create({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            username: interaction.user.tag,
            action: 'Мут',
            details: `Выдал мут ${targetUser.tag} на ${timeStr}. Причина: ${reason}`
        });

        const embed = new EmbedBuilder()
            .setTitle('🔇 Пользователь замучен')
            .setColor('#ED4245')
            .addFields(
                { name: 'Нарушитель', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Модератор', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Время', value: timeStr, inline: true },
                { name: 'Причина', value: reason }
            ).setTimestamp();
        await interaction.reply({ embeds: [embed] });
    },
};
