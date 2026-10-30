const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
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
            
            const rolesStr = char.roles && char.roles.length > 0 
                ? char.roles.map(r => r === 'Танк' ? '🛡️ Танк' : (r === 'ДД (Урон)' ? '⚔️ ДД' : '💚 Хил')).join(' | ') 
                : 'Не указаны';

            let charValue = `🏰 **Гильдия:** ${char.guildName || 'Не указана'}\n`;
            charValue += `⚔️ **Роли:** ${rolesStr}\n`;
            charValue += `🎯 **Тип сборки:** ${char.buildType || 'PvE'}\n`;
            if (char.bio) charValue += `*"${char.bio}"*`;

            embed.addFields({ name: charTitle, value: charValue, inline: false });
        });

        if (profile.isGlobal) embed.setFooter({ text: '🌐 Глобальный профиль' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`view_builds_${targetUser.id}`).setLabel('Посмотреть Билд').setStyle(ButtonStyle.Success).setEmoji('🎯')
        );

        const response = await interaction.reply({ embeds: [embed], components: [row] });

        // Сборщик кнопок для просмотра билда
        const collector = response.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Это меню не для вас.', ephemeral: true });

            if (i.customId.startsWith('view_builds_')) {
                // Создаем меню выбора PvP / PvE
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_build_type')
                    .setPlaceholder('Выберите тип сборки для просмотра')
                    .addOptions([
                        { label: 'PvE', description: 'Сборка для PvE контента', value: 'PvE', emoji: '🌿' },
                        { label: 'PvP', description: 'Сборка для PvP сражений', value: 'PvP', emoji: '⚔️' }
                    ]);

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);

                await i.reply({ 
                    content: 'Выберите, какой билд вы хотите посмотреть:', 
                    components: [menuRow], 
                    ephemeral: true 
                });

                // Ждем выбор из меню
                const menuFilter = m => m.user.id === interaction.user.id && m.customId === 'select_build_type';
                const menuInteraction = await i.channel.awaitMessageComponent({ filter: menuFilter, time: 60000 }).catch(() => null);

                if (!menuInteraction) return;

                const selectedType = menuInteraction.values[0];
                
                // Ищем персонажа с нужным типом билда
                const charWithBuild = profile.characters.find(c => c.buildType === selectedType) || profile.characters[0];

                if (!charWithBuild) return menuInteraction.update({ content: 'Билд не найден.', components: [] });

                const buildEmbed = new EmbedBuilder()
                    .setTitle(`🎯 Билд: ${charWithBuild.gameNickname || 'Персонаж'} (${selectedType})`)
                    .setColor(selectedType === 'PvP' ? '#e74c3c' : '#2ecc71')
                    .setDescription(`Ниже представлены ваши выбранные навыки и пути.`);

                // Добавляем Мистические Навыки
                if (charWithBuild.mysticSkills && charWithBuild.mysticSkills.length > 0) {
                    buildEmbed.addFields({ 
                        name: '✨ Мистические Навыки', 
                        value: charWithBuild.mysticSkills.map(s => `• ${s}`).join('\n'), 
                        inline: true 
                    });
                } else {
                    buildEmbed.addFields({ name: '✨ Мистические Навыки', value: '*Не выбраны*', inline: true });
                }

                // Добавляем Внутренние Пути
                if (charWithBuild.innerWays && charWithBuild.innerWays.length > 0) {
                    buildEmbed.addFields({ 
                        name: '🧘 Внутренние Пути', 
                        value: charWithBuild.innerWays.map(s => `• ${s}`).join('\n'), 
                        inline: true 
                    });
                } else {
                    buildEmbed.addFields({ name: '🧘 Внутренние Пути', value: '*Не выбраны*', inline: true });
                }

                // Если есть внешний билд
                if (charWithBuild.buildUrl) {
                    buildEmbed.addFields({ name: '🔗 Внешняя ссылка', value: `[Кликните здесь](${charWithBuild.buildUrl})` });
                }

                await menuInteraction.update({ content: null, embeds: [buildEmbed], components: [] });
            }
        });
    },
};
