const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Roster, RosterConfig } = require('../models'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Отправить в чат красивый список участников по настроенным ролям'),

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
        
        if (!config || !config.columns || config.columns.length === 0) {
            return interaction.editReply({ content: 'Сначала настройте колонки на сайте в разделе "Состав гильдии" -> "Настроить колонки".' });
        }

        const rosterData = await Roster.findOne({ guildId: interaction.guild.id });

        if (!rosterData || !rosterData.data || Object.keys(rosterData.data).length === 0) {
            return interaction.editReply({ content: 'Данные пусты. Зайдите на сайт в раздел "Состав гильдии" и нажмите "Обновить данные".' });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Состав гильдии')
            .setColor('#2b2d31')
            .setDescription('Актуальный список участников по ролям.')
            .setFooter({ text: `Обновлено: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` });

        let totalUnique = new Set();

        for (const col of config.columns) {
            const roleData = rosterData.data[col.roleId]; 
            
            // Разделяем название колонки и эмодзи (если он есть)
            // Ищем паттерн <:name:id> в начале строки
            const emojiMatch = col.name.match(/^(<a?:[a-zA-Z0-9_]+:[0-9]+>)\s*(.*)$/);
            
            let emoji = '';
            let cleanName = col.name;

            if (emojiMatch) {
                emoji = emojiMatch[1]; // Сам эмодзи
                cleanName = emojiMatch[2]; // Текст без эмодзи
            }
            
            // Формируем список участников
            let memberList = '*Никого нет*';
            if (roleData && roleData.length > 0) {
                memberList = roleData.map(m => `<@${m.id}>`).join(', ');
                if (memberList.length > 1000) memberList = memberList.substring(0, 1000) + '...';
                roleData.forEach(m => totalUnique.add(m.id));
            }

            // Вставляем эмодзи в НАЧАЛО текста с участниками, так как Discord не рендерит их в заголовках
            const finalValue = emoji ? `${emoji} ${memberList}` : memberList;

            embed.addFields({ 
                name: `${cleanName} (${roleData ? roleData.length : 0})`, 
                value: finalValue, 
                inline: false 
            });
        }

        embed.setDescription(`**Всего участников:** ${totalUnique.size}\nАктуальный список участников по ролям.`);

        await interaction.editReply({ embeds: [embed] });
    },
};
