const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сказать')
        .setDescription('Отправить сообщение от лица бота')
        .addStringOption(option => option.setName('текст').setDescription('Текст').setRequired(true))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку').setRequired(false)),

    async execute(interaction) {
        // --- ПРОВЕРКА ПРАВ ---
        const hasDiscordPerm = interaction.member.permissions.has('ManageMessages');
        let hasCustomPerm = false;
        
        if (fs.existsSync(dbPath)) {
            const settings = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            const guildSettings = settings[interaction.guild.id];
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав!', ephemeral: true });
        }
        // ---------------------

        const text = interaction.options.getString('текст');
        const image = interaction.options.getString('картинка');

        const embed = new EmbedBuilder()
            .setTitle('📢 Объявление')
            .setDescription(text)
            .setColor('#FEE75C')
            .setFooter({ text: `Сообщение от ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (image) embed.setImage(image);

        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Объявление отправлено!', ephemeral: true });
    },
};
