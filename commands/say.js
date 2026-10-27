const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Settings, Log } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сказать')
        .setDescription('Отправить красивое объявление от лица бота')
        .addStringOption(option => option.setName('текст').setDescription('Текст сообщения').setRequired(true))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку').setRequired(false)),

    async execute(interaction) {
        // 1. Проверка прав
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
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

        const text = interaction.options.getString('текст');
        const image = interaction.options.getString('картинка');

        const embed = new EmbedBuilder()
            .setTitle('📢 Объявление')
            .setDescription(text)
            .setColor('#d4af37') // Золотой цвет в стиле твоего сайта
            .setFooter({ text: `Сообщение от ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (image) embed.setImage(image);

        try {
            // Отправляем в канал
            await interaction.channel.send({ embeds: [embed] });
            
            // 2. Запись в логи
            await Log.create({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                username: interaction.user.tag,
                action: 'Объявление',
                details: `Отправил объявление в #${interaction.channel.name}`
            });

            // Скрытый ответ
            await interaction.reply({ content: '✅ Объявление успешно отправлено!', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Ошибка при отправке.', ephemeral: true });
        }
    },
};
