const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models'); // Подключаем БД

module.exports = {
    data: new SlashCommandBuilder()
        .setName('мут')
        .setDescription('Выдать пользователю мут (тайм-аут)')
        .addUserOption(option => option.setName('пользователь').setDescription('Кого замутить?').setRequired(true))
        .addStringOption(option => option.setName('время').setDescription('Время (например: 10m, 1h, 1d)').setRequired(true))
        .addStringOption(option => option.setName('причина').setDescription('Причина мута').setRequired(false)),

    async execute(interaction) {
        // 1. ПРОВЕРКА ПРАВ ИЗ БАЗЫ ДАННЫХ
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
        const timeStr = interaction.options.getString('время');
        const reason = interaction.options.getString('причина') || 'Причина не указана';

        // Проверка иерархии ролей
        if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: 'Вы не можете замутить человека с равной или высшей ролью!', ephemeral: true });
        }

        // Парсинг времени
        let ms = 0;
        if (timeStr.endsWith('m')) ms = parseInt(timeStr) * 60 * 1000;
        else if (timeStr.endsWith('h')) ms = parseInt(timeStr) * 60 * 60 * 1000;
        else if (timeStr.endsWith('d')) ms = parseInt(timeStr) * 24 * 60 * 60 * 1000;
        else return interaction.reply({ content: 'Неверный формат времени. Используй: 10m (минут), 1h (час), 1d (день).', ephemeral: true });

        if (isNaN(ms) || ms > 2419200000) {
            return interaction.reply({ content: 'Время мута не может превышать 28 дней!', ephemeral: true });
        }

        await targetMember.timeout(ms, reason);

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
