const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { PlayerProfile } = require('../models');
// Импортируем метаданные (файл должен лежать в корне проекта или в папке, доступной для require)
const GAME_META = require('../public/js/gamedata_meta.js');
// Импортируем основные данные (предполагается, что gamedata.js экспортирует GAME_DATA)
// Если gamedata.js не экспортирует модуль, можно создать аналогичный файл для бота или использовать require
// Пока предположим, что у нас есть доступ к GAME_DATA через require (нужно будет адаптировать)
const GAME_DATA = require('../public/js/gamedata.js'); // Если это не сработает, нужно будет создать копию для бота

module.exports = {
    data: new SlashCommandBuilder()
        .setName('профиль')
        .setDescription('Посмотреть игровой профиль')
        .addUserOption(option => option.setName('пользователь').setDescription('Чей профиль посмотреть?').setRequired(false))
        .addStringOption(option =>
            option.setName('класс').setDescription('Посмотреть список всех игроков этого класса').setRequired(false)
            .addChoices(
                { name: 'Танк', value: 'Танк' },
                { name: 'ДД (Урон)', value: 'ДД (Урон)' },
                { name: 'Хил (Поддержка)', value: 'Хил (Поддержка)' }
            )),

    async execute(interaction) {
        const targetClass = interaction.options.getString('класс');
        const guildId = interaction.guild.id;

        if (targetClass) {
            // ... (оставляем без изменений)
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

            const hasPvE = char.builds?.PvE?.mysticSkills?.length > 0 || char.builds?.PvE?.innerWays?.length > 0;
            const hasPvP = char.builds?.PvP?.mysticSkills?.length > 0 || char.builds?.PvP?.innerWays?.length > 0;
            
            let buildsText = [];
            if (hasPvE) buildsText.push('🌿 PvE');
            if (hasPvP) buildsText.push('⚔️ PvP');
            const buildsStr = buildsText.length > 0 ? buildsText.join(' | ') : 'Билды не настроены';

            let charValue = `🏰 **Гильдия:** ${char.guildName || 'Не указана'}\n`;
            charValue += `⚔️ **Роли:** ${rolesStr}\n`;
            charValue += `🎯 **Доступные билды:** ${buildsStr}\n`;
            if (char.bio) charValue += `*"${char.bio}"*`;

            embed.addFields({ name: charTitle, value: charValue, inline: false });
        });

        if (profile.isGlobal) embed.setFooter({ text: '🌐 Глобальный профиль' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`view_builds_${targetUser.id}`).setLabel('Посмотреть Билды').setStyle(ButtonStyle.Success).setEmoji('🎯')
        );

        const response = await interaction.reply({ embeds: [embed], components: [row] });

        const collector = response.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Это меню не для вас.', ephemeral: true });

            if (i.customId.startsWith('view_builds_')) {
                const hasPvE = profile.characters.some(c => c.builds?.PvE?.mysticSkills?.length > 0 || c.builds?.PvE?.innerWays?.length > 0);
                const hasPvP = profile.characters.some(c => c.builds?.PvP?.mysticSkills?.length > 0 || c.builds?.PvP?.innerWays?.length > 0);

                if (!hasPvE && !hasPvP) {
                    return i.reply({ content: '❌ У вас пока не настроены билды на сайте.', ephemeral: true });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_build_type')
                    .setPlaceholder('Выберите, какой билд показать')
                    .addOptions([
                        { label: 'PvE Билд', description: 'Сборка для PvE контента', value: 'PvE', emoji: '🌿' },
                        { label: 'PvP Билд', description: 'Сборка для PvP сражений', value: 'PvP', emoji: '⚔️' }
                    ]);

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);
                await i.reply({ content: 'Выберите тип билда:', components: [menuRow], ephemeral: true });

                const menuFilter = m => m.user.id === interaction.user.id && m.customId === 'select_build_type';
                const menuInteraction = await i.channel.awaitMessageComponent({ filter: menuFilter, time: 60000 }).catch(() => null);
                if (!menuInteraction) return;

                const selectedType = menuInteraction.values[0];
                const charWithBuild = profile.characters.find(c => 
                    c.builds && c.builds[selectedType] && 
                    (c.builds[selectedType].mysticSkills?.length > 0 || c.builds[selectedType].innerWays?.length > 0)
                );

                if (!charWithBuild) {
                    return menuInteraction.update({ content: `У вас нет сохраненного ${selectedType} билда.`, embeds: [], components: [] });
                }

                const buildData = charWithBuild.builds[selectedType];
                const buildEmbed = new EmbedBuilder()
                    .setTitle(`🎯 ${charWithBuild.gameNickname || 'Персонаж'} — ${selectedType} Билд`)
                    .setColor(selectedType === 'PvP' ? '#e74c3c' : '#2ecc71')
                    .setDescription(`Сборка для режима **${selectedType}**`);

                // Функция для форматирования навыка с редкостью и описанием
                const formatSkill = (type, id) => {
                    const meta = GAME_META[type === 'mystic' ? 'mysticSkills' : 'innerWays'][id] || { rarity: 'Common', desc: '' };
                    const data = type === 'mystic' 
                        ? GAME_DATA.mysticSkills.find(s => s.id === id) 
                        : GAME_DATA.innerWays.find(s => s.id === id);
                    const name = data ? data.nameRU : id;
                    const rarityEmoji = {
                        'Legendary': '🌟', 'Epic': '💜', 'Rare': '💙', 'Common': '⚪',
                        'Offensive': '🔴', 'General': '🟢', 'Movement': '🔵'
                    }[meta.rarity] || '⚪';
                    return `${rarityEmoji} **${name}**\n> ${meta.desc || 'Описание отсутствует.'}`;
                };

                // Мистические навыки
                if (buildData.mysticSkills && buildData.mysticSkills.length > 0) {
                    const skillList = buildData.mysticSkills.map(id => formatSkill('mystic', id)).join('\n\n');
                    buildEmbed.addFields({ name: '✨ Мистические Навыки', value: skillList, inline: false });
                } else {
                    buildEmbed.addFields({ name: '✨ Мистические Навыки', value: '*Не выбраны*', inline: false });
                }

                // Внутренние пути
                if (buildData.innerWays && buildData.innerWays.length > 0) {
                    const wayList = buildData.innerWays.map(id => formatSkill('inner', id)).join('\n\n');
                    buildEmbed.addFields({ name: '🧘 Внутренние Пути', value: wayList, inline: false });
                } else {
                    buildEmbed.addFields({ name: '🧘 Внутренние Пути', value: '*Не выбраны*', inline: false });
                }

                await menuInteraction.update({ content: null, embeds: [buildEmbed], components: [] });
            }
        });
    },
};
