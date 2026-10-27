const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Roster, RosterConfig, RosterMessage } = require('../models'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Создать автоматически обновляемый список участников в этом канале'),

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

        // Ищем, есть ли уже сообщение от этого бота в ТЕКУЩЕМ канале
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        const existingMsg = messages.find(m => m.author.id === interaction.client.user.id && m.embeds.length > 0);

        if (existingMsg) {
            // Если есть, редактируем
            await existingMsg.edit({ embeds: buildEmbeds().slice(0, 10) });
            await RosterMessage.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { channelId: interaction.channelId, messageId: existingMsg.id },
                { upsert: true }
            );
            await interaction.editReply({ content: '✅ Существующее сообщение обновлено!' });
        } else {
            // Если нет, создаем новое
            const sentMsg = await interaction.channel.send({ embeds: buildEmbeds().slice(0, 10) });
            await RosterMessage.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { channelId: sentMsg.channelId, messageId: sentMsg.id },
                { upsert: true }
            );
            await interaction.editReply({ content: '✅ Сообщение создано и сохранено!' });
        }
    },
};
