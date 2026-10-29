const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PlayerProfile } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('профиль')
        .setDescription('Посмотреть игровой профиль')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Чей профиль посмотреть?')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('класс')
                .setDescription('Посмотреть список всех игроков этого класса')
                .setRequired(false)
                .addChoices(
                    { name: 'Танк', value: 'Танк' },
                    { name: 'ДД (Урон)', value: 'ДД (Урон)' },
                    { name: 'Хил (Поддержка)', value: 'Хил (Поддержка)' }
                )),

    async execute(interaction) {
        const targetClass = interaction.options.getString('класс');
        const guildId = interaction.guild.id;

        if (targetClass) {
            const btn = new ButtonBuilder().setCustomId(`show_class_${targetClass}`).setLabel(`Показать всех: ${targetClass}`).setStyle(ButtonStyle.Primary).setEmoji('📋');
            const row = new ActionRowBuilder().addComponents(btn);
            const embed = new EmbedBuilder().setTitle(`🎭 Класс: ${targetClass}`).setDescription('Нажмите на кнопку ниже.').setColor('#d4af37');
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        const targetUser = interaction.options.getUser('пользователь') || interaction.user;
        
        let profile = await PlayerProfile.findOne({ userId: targetUser.id, guildId });
        if (!profile || !profile.characters || profile.characters.length === 0) {
            profile = await PlayerProfile.findOne({ userId: targetUser.id, isGlobal: true });
        }

        if (!profile || !profile.characters || profile.characters.length === 0) {
            return interaction.reply({ 
                content: targetUser.id === interaction.user.id 
                    ? '❌ Вы еще не заполнили профиль! Зайдите на сайт.' 
                    : `❌ У пользователя <@${targetUser.id}> нет профиля.`, 
                ephemeral: true 
            });
        }

        const avatarUrl = targetUser.avatar ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
        const embed = new EmbedBuilder().setAuthor({ name: `Профиль ${targetUser.username}`, iconURL: avatarUrl }).setColor('#d4af37').setThumbnail(avatarUrl);

        profile.characters.forEach((char, index) => {
            const charTitle = `👤 Персонаж ${index + 1}: ${char.gameNickname || 'Без ника'}`;
            
            // Формируем красивый вывод массивов
            const rolesStr = char.roles && char.roles.length > 0 ? char.roles.join(', ') : 'Не указаны';
            const artsStr = char.martialArts && char.martialArts.length > 0 ? char.martialArts.join(', ') : 'Не указаны';
            const weaponsStr = char.weapons && char.weapons.length > 0 ? char.weapons.join(', ') : 'Не указано';

            let charValue = `🏰 **Гильдия:** ${char.guildName || 'Не указана'}\n`;
            charValue += `⚔️ **Роли:** ${rolesStr}\n`;
            charValue += `🥋 **Искусства:** ${artsStr}\n`;
            charValue += `🗡️ **Оружие:** ${weaponsStr}\n`;
            if (char.bio) charValue += `*"${char.bio}"*`;

            embed.addFields({ name: charTitle, value: charValue, inline: false });
        });

        if (profile.isGlobal) embed.setFooter({ text: '🌐 Глобальный профиль' });
        await interaction.reply({ embeds: [embed] });
    },
};
