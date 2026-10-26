const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models'); // Импортируем модель

module.exports = {
    data: new SlashCommandBuilder()
        .setName('настройки')
        .setDescription('Настройки бота и выдача прав на модерацию')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand.setName('добавить_роль').setDescription('Разрешить роли использовать модерацию').addRoleOption(option => option.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('удалить_роль').setDescription('Запретить роли модерацию').addRoleOption(option => option.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('посмотреть').setDescription('Посмотреть список разрешенных ролей')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Ищем настройки в БД или создаем новые
        let guildSettings = await Settings.findOne({ guildId });
        if (!guildSettings) {
            guildSettings = await Settings.create({ guildId, modRoles: [] });
        }

        if (subcommand === 'добавить_роль') {
            const role = interaction.options.getRole('роль');
            if (!guildSettings.modRoles.includes(role.id)) {
                guildSettings.modRoles.push(role.id);
                await guildSettings.save();
            }
            await interaction.reply({ content: `✅ Роль **${role.name}** теперь может использовать модерацию!`, ephemeral: true });
        }

        if (subcommand === 'удалить_роль') {
            const role = interaction.options.getRole('роль');
            guildSettings.modRoles = guildSettings.modRoles.filter(id => id !== role.id);
            await guildSettings.save();
            await interaction.reply({ content: `❌ Роль **${role.name}** больше не может использовать модерацию.`, ephemeral: true });
        }

        if (subcommand === 'посмотреть') {
            if (guildSettings.modRoles.length === 0) return interaction.reply({ content: 'Список разрешенных ролей пуст.', ephemeral: true });
            const roleMentions = guildSettings.modRoles.map(id => `<@&${id}>`).join('\n');
            const embed = new EmbedBuilder().setTitle('🛡️ Настройки модерации').setDescription(roleMentions).setColor('#5865F2');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
