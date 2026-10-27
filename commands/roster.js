const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Roster } = require('../models'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Отправить в чат красивый список участников по ролям'),

    async execute(interaction) {
        // 1. ПРОВЕРКА ПРАВ
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        let hasCustomPerm = false;
        
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        } catch (e) {
            console.error("Ошибка при проверке прав из БД:", e);
        }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        // 2. ПОЛУЧАЕМ ДАННЫЕ ИЗ БАЗЫ
        await interaction.deferReply(); // Говорим Дискорду "подожди", чтобы не было ошибки таймаута
        const rosterData = await Roster.findOne({ guildId: interaction.guild.id });

        if (!rosterData || !rosterData.data || Object.keys(rosterData.data).length === 0) {
            return interaction.editReply({ content: 'Список пуст. Зайдите на сайт в раздел "Состав гильдии" и нажмите "Обновить данные".' });
        }

        // 3. ФОРМИРУЕМ EMBED
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Состав гильдии')
            .setColor('#2b2d31')
            .setDescription('Актуальный список участников по ролям.')
            .setFooter({ text: `Последнее обновление: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` });

        // Считаем уникальных людей (для статистики)
        const uniqueMembers = new Set();
        
        // Проходимся по всем ролям, которые сохранились в базе
        for (const [roleName, members] of Object.entries(rosterData.data)) {
            if (members.length === 0) continue;

            members.forEach(m => uniqueMembers.add(m.id));

            // Формируем строчку с именами
            let memberList = members.map(m => `<@${m.id}>`).join(', ');
            
            // Ограничиваем длину, чтобы не превысить лимиты Discord
            if (memberList.length > 1000) {
                memberList = memberList.substring(0, 1000) + '... и другие';
            }

            embed.addFields({ 
                name: `${roleName} (${members.length})`, 
                value: memberList, 
                inline: false 
            });
        }

        embed.setDescription(`**Всего участников:** ${uniqueMembers.size}\nАктуальный список участников по ролям.`);

        // 4. ОТПРАВЛЯЕМ В ЧАТ
        await interaction.editReply({ embeds: [embed] });
    },
};
