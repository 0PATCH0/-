const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Roster, RosterConfig } = require('../models'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Отправить в чат красивый список участников (по одному Embed на класс)'),

    async execute(interaction) {
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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

        await interaction.deferReply();

        const config = await RosterConfig.findOne({ guildId: interaction.guild.id });
        const rosterData = await Roster.findOne({ guildId: interaction.guild.id });

        if (!config || !config.columns || config.columns.length === 0) {
            return interaction.editReply({ content: 'Сначала настройте колонки на сайте.' });
        }

        if (!rosterData || !rosterData.data) {
            return interaction.editReply({ content: 'Данные пусты. Обновите их на сайте.' });
        }

        const embedsToSend = [];
        let totalUnique = new Set();

        // Генерируем Embed для каждой настроенной колонки
        config.columns.forEach((col, index) => {
            const roleData = rosterData.data[col.roleId] || [];
            
            roleData.forEach(m => totalUnique.add(m.id));

            let memberList = roleData.length > 0 ? roleData.map(m => `<@${m.id}>`).join('\n') : '*Никого нет*';
            
            // Если текст слишком длинный, обрезаем
            if (memberList.length > 4000) {
                memberList = memberList.substring(0, 4000) + '\n...и другие';
            }

            // Создаем отдельный Embed для этой роли
            const embed = new EmbedBuilder()
                .setTitle(col.name) // Эмодзи в заголовке будет работать!
                .setColor(col.color || '#5865F2') // Твой цвет полоски
                .setDescription(memberList)
                .setFooter({ text: `Участников в роли: ${roleData.length} • Обновлено: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` });

            embedsToSend.push(embed);
        });

        // Добавляем самый первый Embed со статистикой
        const headerEmbed = new EmbedBuilder()
            .setTitle('🛡️ Состав гильдии')
            .setColor('#2b2d31')
            .setDescription(`**Всего уникальных участников:** ${totalUnique.size}\nНиже представлен список по классам.`)
            .setTimestamp();
        
        embedsToSend.unshift(headerEmbed);

        // Отправляем сообщения пачками (Discord разрешает максимум 10 Embed в одном сообщении)
        for (let i = 0; i < embedsToSend.length; i += 10) {
            const chunk = embedsToSend.slice(i, i + 10);
            await interaction.followUp({ embeds: chunk });
        }

        // Удаляем сообщение "Бот думает..."
        await interaction.editReply({ content: '✅ Список отправлен!', embeds: [] });
    },
};
