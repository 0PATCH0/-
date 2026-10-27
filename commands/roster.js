const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Roster, RosterConfig, RosterMessage } = require('../models'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Создать или обновить автоматический список участников в этом канале'),

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
            return interaction.reply({ content: 'У вас нет прав!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const config = await RosterConfig.findOne({ guildId: interaction.guild.id });
        const rosterData = await Roster.findOne({ guildId: interaction.guild.id });

        if (!config || !config.columns || config.columns.length === 0) return interaction.editReply({ content: 'Настройте колонки на сайте.' });
        if (!rosterData || !rosterData.data) return interaction.editReply({ content: 'Данные пусты. Обновите их на сайте.' });

        const buildEmbeds = () => {
            const embeds = [];
            let totalUnique = new Set();
            config.columns.forEach((col) => {
                const roleData = rosterData.data[col.roleId] || [];
                roleData.forEach(m => totalUnique.add(m.id));
                let memberList = roleData.length > 0 ? roleData.map(m => `<@${m.id}>`).join('\n') : '*Никого нет*';
                if (memberList.length > 4000) memberList = memberList.substring(0, 4000) + '\n...и другие';
                embeds.push(new EmbedBuilder().setTitle(col.name).setColor(col.color || '#5865F2').setDescription(memberList).setFooter({ text: `Участников: ${roleData.length}` }));
            });
            embeds.unshift(new EmbedBuilder().setTitle('🛡️ Состав гильдии').setColor('#2b2d31').setDescription(`**Всего участников:** ${totalUnique.size}`).setTimestamp());
            return embeds;
        };

        // Ищем запись ТОЛЬКО для этого канала
        const existingMsgRecord = await RosterMessage.findOne({ 
            guildId: interaction.guild.id, 
            channelId: interaction.channelId 
        });

        if (existingMsgRecord) {
            // Проверяем, существует ли еще это сообщение в Discord
            const message = await interaction.channel.messages.fetch(existingMsgRecord.messageId).catch(() => null);
            
            if (message) {
                // Если сообщение есть, редактируем его
                await message.edit({ embeds: buildEmbeds().slice(0, 10) });
                return interaction.editReply({ content: '✅ Существующее сообщение обновлено!' });
            } else {
                // Если сообщение удалили вручную, удаляем старую запись
                await RosterMessage.deleteOne({ _id: existingMsgRecord._id });
            }
        }

        // Если сообщения нет (или его удалили), создаем новое
        const sentMsg = await interaction.channel.send({ embeds: buildEmbeds().slice(0, 10) });
        await RosterMessage.create({ 
            guildId: interaction.guild.id, 
            channelId: sentMsg.channelId, 
            messageId: sentMsg.id 
        });
        await interaction.editReply({ content: '✅ Новое сообщение создано и сохранено!' });
    },
};
