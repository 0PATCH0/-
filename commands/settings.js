const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../settings.json');

function loadSettings() {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '{}');
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveSettings(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('настройки')
        .setDescription('Настройки бота и выдача прав на модерацию')
        // Доступ только для админов сервера
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand.setName('добавить_роль')
                .setDescription('Разрешить роли использовать команды модерации')
                .addRoleOption(option => option.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('удалить_роль')
                .setDescription('Запретить роли использовать команды модерации')
                .addRoleOption(option => option.setName('роль').setDescription('Выберите роль').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('посмотреть')
                .setDescription('Посмотреть список разрешенных ролей')),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const settings = loadSettings();
        
        if (!settings[guildId]) settings[guildId] = { modRoles: [] };

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'добавить_роль') {
            const role = interaction.options.getRole('роль');
            if (!settings[guildId].modRoles.includes(role.id)) {
                settings[guildId].modRoles.push(role.id);
                saveSettings(settings);
            }
            await interaction.reply({ content: `✅ Роль **${role.name}** теперь может использовать команды модерации!`, ephemeral: true });
        }

        if (subcommand === 'удалить_роль') {
            const role = interaction.options.getRole('роль');
            settings[guildId].modRoles = settings[guildId].modRoles.filter(id => id !== role.id);
            saveSettings(settings);
            await interaction.reply({ content: `❌ Роль **${role.name}** больше не может использовать команды модерации.`, ephemeral: true });
        }

        if (subcommand === 'посмотреть') {
            const roles = settings[guildId].modRoles;
            if (roles.length === 0) {
                return interaction.reply({ content: 'Список разрешенных ролей пуст. Администраторы и так могут использовать все команды.', ephemeral: true });
            }
            const roleMentions = roles.map(id => `<@&${id}>`).join('\n');
            
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Настройки модерации')
                .setDescription(`Роли, которым разрешено использовать команды модерации:\n\n${roleMentions}`)
                .setColor('#5865F2');

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
