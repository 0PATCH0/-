const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('настройки')
        .setDescription('Настройки бота на сервере')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('добавить_роль').setDescription('Разрешить роли использовать модерацию').addRoleOption(o => o.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(sub => sub.setName('удалить_роль').setDescription('Запретить роли модерацию').addRoleOption(o => o.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(sub => sub.setName('посмотреть').setDescription('Посмотреть список модераторов')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        let settings = await Settings.findOne({ guildId });
        if (!settings) settings = await Settings.create({ guildId, modRoles: [] });

        if (sub === 'добавить_роль') {
            const role = interaction.options.getRole('роль');
            if (!settings.modRoles.includes(role.id)) {
                settings.modRoles.push(role.id);
                await settings.save();
            }
            const embed = new EmbedBuilder().setTitle('✅ Роль добавлена').setColor('#2ECC71').setDescription(`Роль **${role.name}** теперь может использовать модерацию.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'удалить_роль') {
            const role = interaction.options.getRole('роль');
            settings.modRoles = settings.modRoles.filter(id => id !== role.id);
            await settings.save();
            const embed = new EmbedBuilder().setTitle('❌ Роль удалена').setColor('#E74C3C').setDescription(`Роль **${role.name}** больше не может использовать модерацию.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'посмотреть') {
            const roles = settings.modRoles.length > 0 ? settings.modRoles.map(id => `<@&${id}>`).join('\n') : 'Список пуст.';
            const embed = new EmbedBuilder().setTitle('🛡️ Роли модераторов').setColor('#d4af37').setDescription(roles);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
