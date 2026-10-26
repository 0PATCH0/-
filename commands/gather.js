const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сбор')
        .setDescription('Создать сбор людей с разделением на команды')
        .addStringOption(option => option.setName('название').setDescription('Название сбора').setRequired(true))
        .addIntegerOption(option => option.setName('команд').setDescription('Количество команд (от 2 до 5)').setRequired(true).setMinValue(2).setMaxValue(5))
        .addStringOption(option => option.setName('имена_команд').setDescription('Названия команд через запятую (например: Синие, Красные, Желтые)').setRequired(true))
        .addIntegerOption(option => option.setName('лимит').setDescription('Максимум людей в одной команде (0 - без лимита)').setRequired(false))
        .addStringOption(option => option.setName('описание').setDescription('Описание сбора').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('название');
        const teamsCount = interaction.options.getInteger('команд');
        const teamNamesRaw = interaction.options.getString('имена_команд').split(',').map(s => s.trim());
        const limit = interaction.options.getInteger('лимит') || 0;
        const description = interaction.options.getString('описание');
        const creatorId = interaction.user.id;

        // Проверяем, хватает ли названий
        if (teamNamesRaw.length < teamsCount) {
            return interaction.reply({ content: 'Ошибка: Вы указали меньше названий команд, чем само количество команд.', ephemeral: true });
        }
        const teamNames = teamNamesRaw.slice(0, teamsCount);

        // Состояние сбора
        const state = {
            title, description, teamNames, limit, creatorId,
            locked: false, // Заблокированы ли переходы
            teams: {}, // Объект: Индекс команды -> Массив ID участников
            messageId: null
        };
        teamNames.forEach((_, i) => state.teams[i] = []);

        // Функция генерации красивого Embed
        function generateEmbed(isEnded = false) {
            const embed = new EmbedBuilder()
                .setTitle(`📋 Сбор: ${title}`)
                .setColor(isEnded ? '#2f3136' : (state.locked ? '#ED4245' : '#57F287')) // Зеленый - открыт, Красный - закрыт переход, Серый - окончен
                .setFooter({ 
                    text: isEnded ? 'Сбор завершен' : (state.locked ? 'Переходы закрыты' : 'Сбор открыт • Переходы открыты'), 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            if (description) embed.setDescription(description);

            teamNames.forEach((name, index) => {
                const members = state.teams[index];
                const membersStr = members.length > 0 ? members.map(id => `<@${id}>`).join(', ') : '*Пока никого*';
                
                let fieldName = `🛡️ ${name}`;
                if (limit > 0) fieldName += ` (${members.length}/${limit})`;
                else fieldName += ` (${members.length})`;

                embed.addFields({ name: fieldName, value: membersStr, inline: false });
            });
            return embed;
        }

        // Функция генерации меню выбора команды (вместо кнопок, чтобы обойти лимиты)
        function generateMenu(isEnded = false) {
            if (isEnded) return [];
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('team_select')
                .setPlaceholder(state.locked ? 'Выбор команды заблокирован создателем' : 'Выберите команду для вступления')
                .setDisabled(state.locked); // Если закрыто - меню неактивно

            teamNames.forEach((name, index) => {
                select.addOptions({
                    label: name,
                    description: limit > 0 ? `Мест: ${limit - state.teams[index].length}` : `Участников: ${state.teams[index].length}`,
                    value: `team_${index}`,
                    emoji: '🛡️'
                });
            });

            // Добавляем кнопки настроек для создателя
            const buttons = new ActionRowBuilder();
            if (!isEnded) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('gather_settings')
                        .setLabel('Настройки')
                        .setEmoji('⚙️')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            return [new ActionRowBuilder().addComponents(select), buttons];
        }

        // Отправляем сообщение
        const response = await interaction.reply({ 
            embeds: [generateEmbed()], 
            components: generateMenu(),
            fetchReply: true 
        });
        state.messageId = response.id;

        // Сборщик взаимодействий
        const collector = response.createMessageComponentCollector({ 
            time: 86400000 // Работает 24 часа
        });

        collector.on('collect', async i => {
            // --- ОБРАБОТКА МЕНЮ ВЫБОРА КОМАНДЫ ---
            if (i.customId === 'team_select') {
                if (state.locked) {
                    return i.reply({ content: 'Создатель закрыл переходы. Вы не можете сменить команду.', ephemeral: true });
                }

                const selectedIndex = parseInt(i.values[0].split('_')[1]);
                const userId = i.user.id;

                // Проверяем, есть ли он уже в команде
                let currentTeamIndex = -1;
                for (const key in state.teams) {
                    if (state.teams[key].includes(userId)) {
                        currentTeamIndex = parseInt(key);
                        break;
                    }
                }

                // Если выбрал ту же команду - ничего не делаем
                if (currentTeamIndex === selectedIndex) {
                    return i.reply({ content: 'Вы уже в этой команде!', ephemeral: true });
                }

                // Проверка лимита
                if (limit > 0 && state.teams[selectedIndex].length >= limit) {
                    return i.reply({ content: `В команде **${teamNames[selectedIndex]}** уже максимальное количество людей!`, ephemeral: true });
                }

                // Удаляем из старой команды
                if (currentTeamIndex !== -1) {
                    state.teams[currentTeamIndex] = state.teams[currentTeamIndex].filter(id => id !== userId);
                }
                // Добавляем в новую
                state.teams[selectedIndex].push(userId);

                await i.update({ embeds: [generateEmbed()], components: generateMenu() });
            }

            // --- ОБРАБОТКА КНОПКИ НАСТРОЕК (Только для создателя) ---
            if (i.customId === 'gather_settings') {
                if (i.user.id !== creatorId) {
                    return i.reply({ content: 'Только создатель сбора может открыть настройки!', ephemeral: true });
                }

                // Создаем приватное сообщение с настройками
                const settingsEmbed = new EmbedBuilder()
                    .setTitle('⚙️ Панель управления сбором')
                    .setDescription('Здесь вы можете управлять переходом и кикать участников.')
                    .setColor('#FEE75C');

                const btnRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_lock')
                        .setLabel(state.locked ? 'Открыть переходы' : 'Закрыть переходы')
                        .setEmoji(state.locked ? '🔓' : '🔒')
                        .setStyle(state.locked ? ButtonStyle.Success : ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('end_gather')
                        .setLabel('Завершить сбор')
                        .setEmoji('🏁')
                        .setStyle(ButtonStyle.Primary)
                );

                const btnRow2 = new ActionRowBuilder();
                // Если есть люди - добавляем меню для кика
                const allMembers = Object.values(state.teams).flat();
                if (allMembers.length > 0) {
                    const kickMenu = new StringSelectMenuBuilder()
                        .setCustomId('kick_member')
                        .setPlaceholder('Выберите участника для кика')
                        .addOptions(allMembers.slice(0, 25).map(id => ({
                            label: `Кикнуть`,
                            description: `Удалить пользователя с ID ${id}`,
                            value: id,
                            emoji: '👢'
                        })));
                    btnRow2.addComponents(kickMenu);
                }

                await i.reply({ embeds: [settingsEmbed], components: btnRow2.components.length > 0 ? [btnRow1, btnRow2] : [btnRow1], ephemeral: true });
            }

            // --- ОБРАБОТКА КНОПОК ИЗ ПАНЕЛИ НАСТРОЕК ---
            if (i.customId === 'toggle_lock' || i.customId === 'end_gather' || i.customId === 'kick_member') {
                if (i.user.id !== creatorId) return;

                if (i.customId === 'toggle_lock') {
                    state.locked = !state.locked;
                    await i.update({ content: state.locked ? '🔒 Переходы закрыты!' : '🔓 Переходы открыты!', components: [], embeds: [] });
                }

                if (i.customId === 'end_gather') {
                    collector.stop('ended');
                    await i.update({ content: '🏁 Сбор завершен!', components: [], embeds: [] });
                }

                if (i.customId === 'kick_member') {
                    const kickedId = i.values[0];
                    for (const key in state.teams) {
                        state.teams[key] = state.teams[key].filter(id => id !== kickedId);
                    }
                    await i.update({ content: `👢 Пользователь <@${kickedId}> удален из сбора!`, components: [], embeds: [] });
                }

                // Обновляем главное сообщение
                await response.edit({ embeds: [generateEmbed()], components: generateMenu() });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'ended') {
                response.edit({ embeds: [generateEmbed(true)], components: generateMenu(true) });
            }
        });
    },
};
