const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, RosterMessage } = require('../models');
const { buildClassifiedRoster, buildRosterEmbeds } = require('../roster-refresh');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('состав')
        .setDescription('Создать или обновить состав гильдии в этом канале'),

    async execute(interaction) {
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        let hasCustomPerm = false;
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        } catch (e) { console.error(e); }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: '❌ У вас нет прав модератора.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const roster = await buildClassifiedRoster(interaction.client, interaction.guild.id);
        const embeds = buildRosterEmbeds(roster, interaction.guild.id);

        if (!embeds || embeds.length === 0) {
            return interaction.editReply({ content: '❌ Не удалось собрать состав.' });
        }

        // Ищем запись для этого канала
        const existing = await RosterMessage.findOne({
            guildId: interaction.guild.id,
            channelId: interaction.channelId
        });

        if (existing) {
            const message = await interaction.channel.messages.fetch(existing.messageId).catch(() => null);
            if (message) {
                await message.edit({ embeds });
                return interaction.editReply({ content: '✅ Состав обновлён.' });
            } else {
                await RosterMessage.deleteOne({ _id: existing._id });
            }
        }

        const sent = await interaction.channel.send({ embeds });
        await RosterMessage.create({
            guildId: interaction.guild.id,
            channelId: sent.channelId,
            messageId: sent.id
        });
        await interaction.editReply({ content: '✅ Состав создан.' });
    }
};
