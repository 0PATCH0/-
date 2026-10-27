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

        // Сначала отвечаем "Думаю...", чтобы Discord не выдал ошибку таймаута
        await interaction.deferReply({ ephemeral: true });

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

        config.columns.forEach((col) => {
            const roleData = rosterData.data[col.roleId] || [];
            
            roleData.forEach(m => totalUnique.add(m.id));

            let memberList = roleData.length > 0 ? roleData.map(m => `<@${m.id}>`).join('\n') : '*Никого нет*';
            
            if (memberList.length > 4000) {
                memberList = memberList.substring(0, 4000) + '\n...и другие';
            }

            const embed = new EmbedBuilder()
                .setTitle(col.name) 
                .setColor(col.color || '#5865F2') 
                .setDescription(memberList)
                .setFooter({ text: `Участников: ${roleData.length} • Обновлено: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` });

            embedsToSend.push(embed);
        });

        const headerEmbed = new EmbedBuilder()
            .setTitle('🛡️ Состав гильдии')
            .setColor('#2b2d31')
            .setDescription(`**Всего уникальных участников:** ${totalUnique.size}\nНиже представлен список по классам.`)
            .setTimestamp();
        
        embedsToSend.unshift(headerEmbed);

        // ОТПРАВЛЯЕМ В КАНАЛ, ЧТОБЫ ОНИ НЕ ПРОПАДАЛИ
        for (let i = 0; i < embedsToSend.length; i += 10) {
            const chunk = embedsToSend.slice(i, i + 10);
            await interaction.channel.send({ embeds: chunk });
        }

        // Удаляем служебное сообщение "Список отправлен!", чтобы не засорять чат
        await interaction.editReply({ content: '✅ Список отправлен в чат!' });
        
        // Опционально: удалить ответ бота через 3 секунды, чтобы вообще ничего не висело
        setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
    },
};
