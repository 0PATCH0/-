const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PlayerProfile } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('профиль')
        .setDescription('Посмотреть игровой профиль')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Чей профиль посмотреть? (по умолчанию - ваш)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('класс')
                .setDescription('Посмотреть список всех игроков этого класса')
                .setRequired(false)
                .addChoices(
                    { name: 'Танк', value: 'Танк' },
                    { name: 'ДД (Урон)', value: 'ДД (Урон)' },
                    { name: 'Хил (Поддержка)', value: 'Хил (Поддержка)' },
                    { name: 'Универсал', value: 'Универсал' }
                )),

    async execute(interaction) {
        const targetClass = interaction.options.getString('класс');

        // Если выбран класс, показываем кнопку для списка
        if (targetClass) {
            const btn = new ButtonBuilder()
                .setCustomId(`show_class_${targetClass}`)
                .setLabel(`Показать всех: ${targetClass}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋');

            const row = new ActionRowBuilder().addComponents(btn);

            const embed = new EmbedBuilder()
                .setTitle(`🎭 Класс: ${targetClass}`)
                .setDescription('Нажмите на кнопку ниже, чтобы увидеть список всех игроков этого класса.')
                .setColor('#d4af37');

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // Если класс не выбран, ищем профиль пользователя
        const targetUser = interaction.options.getUser('пользователь') || interaction.user;
        const profile = await PlayerProfile.findOne({ userId: targetUser.id });

        if (!profile) {
            return interaction.reply({ 
                content: targetUser.id === interaction.user.id 
                    ? '❌ Вы еще не заполнили свой профиль! Зайдите на сайт в раздел "Мой профиль".' 
                    : `❌ Пользователь <@${targetUser.id}> еще не заполнил профиль.`, 
                ephemeral: true 
            });
        }

        const avatarUrl = targetUser.avatar ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const embed = new EmbedBuilder()
            .setTitle(`👤 Профиль: ${profile.gameNickname || targetUser.username}`)
            .setThumbnail(avatarUrl)
            .setColor('#d4af37')
            .addFields(
                { name: '🏰 Гильдия', value: profile.guildName || 'Не указана', inline: true },
                { name: '⚔️ Класс', value: profile.classRole || 'Не указан', inline: true },
                { name: '🗡️ Оружие', value: profile.weapon || 'Не указано', inline: true }
            )
            .setFooter({ text: `Discord: ${targetUser.tag}`, iconURL: avatarUrl });

        if (profile.bio) {
            embed.setDescription(`*"${profile.bio}"*`);
        }

        await interaction.reply({ embeds: [embed] });
    },
};
