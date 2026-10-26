const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сбор')
        .setDescription('Создать продвинутый сбор на ивент (с ролями)')
        .addStringOption(option => option.setName('название').setDescription('Название ивента').setRequired(true))
        .addStringOption(option => option.setName('дата').setDescription('Дата (например, 27 октября)').setRequired(true))
        .addStringOption(option => option.setName('время').setDescription('Время (например, 18:40 - 19:10)').setRequired(true))
        .addIntegerOption(option => option.setName('лимит_танков').setDescription('Сколько Танков нужно? (0 - без лимита)').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_дд').setDescription('Сколько ДД нужно? (0 - без лимита)').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_хилов').setDescription('Сколько Хилов нужно? (0 - без лимита)').setRequired(false))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('название');
        const date = interaction.options.getString('дата');
        const time = interaction.options.getString('время');
        const limitTank = interaction.options.getInteger('лимит_танков') || 0;
        const limitDps = interaction.options.getInteger('лимит_дд') || 0;
        const limitHeal = interaction.options.getInteger('лимит_хилов') || 0;
        const image = interaction.options.getString('картинка');
        const creatorId = interaction.user.id;

        // Настройки ролей
        const roles = [
            { id: 'tank', name: 'Tank', emoji: '🛡️', limit: limitTank },
            { id: 'dps', name: 'Dps', emoji: '⚔️', limit: limitDps },
            { id: 'healer', name: 'Healer', emoji: '💚', limit: limitHeal }
        ];

        // Статусы (доп. кнопки)
        const statuses = [
            { id: 'bench', name: 'Скамейка', emoji: '🪑' },
            { id: 'late', name: 'Поздно', emoji: '⏰' },
            { id: 'prelim', name: 'Предварительный', emoji: '⚖️' },
            { id: 'absent', name: 'Отсутствие', emoji: '⛔' }
        ];

        // Состояние сбора
        const state = {
            locked: false,
            roles: {}, // Танки, ДД, Хилы
            statuses: {} // Доп. статусы
        };
        
        roles.forEach(r => state.roles[r.id] = []);
        statuses.forEach(s => state.statuses[s.id] = []);

        // Функция генерации Embed
        function generateEmbed(isEnded = false) {
            const embed = new EmbedBuilder()
                .setTitle(`Десятки / ${title}`)
                .setColor(isEnded ? '#2f3136' : '#9b59b6') // Фиолетовый, как на скрине
                .setFooter({ text: isEnded ? 'Сбор завершен' : (state.locked ? 'Переходы закрыты' : 'Переходы открыты'), iconURL: interaction.user.displayAvatarURL() });

            if (image) embed.setImage(image);

            // Формируем текстовый блок для Embed (используем эмодзи и переносы строк)
            let desc = `🏳️ **${interaction.user.username}**\n`;
            desc += `📅 ${date}\n\n`;
            
            // Вычисляем общее количество людей (для счетчика 4/10)
            let totalPlayers = 0;
            let maxPlayers = 0;
            roles.forEach(r => {
                totalPlayers += state.roles[r.id].length;
                if (r.limit > 0) maxPlayers += r.limit;
            });
            
            desc += `🚗 **${totalPlayers} / ${maxPlayers > 0 ? maxPlayers : '∞'}**\n`;
            desc += `🕒 ${time}\n\n`;
            desc += `⏳ **за день**\n\n`;

            // Выводим роли
            roles.forEach(r => {
                const members = state.roles[r.id];
                const membersStr = members.length > 0 ? members.map((id, i) => `\`${i + 1}\` <@${id}>`).join('\n') : '*Пусто*';
                desc += `**${r.emoji} ${r.name} (${members.length}/${r.limit > 0 ? r.limit : '∞'})**\n${membersStr}\n\n`;
            });

            // Выводим статусы
            desc += `──────────────\n`;
            statuses.forEach(s => {
                const members = state.statuses[s.id];
                if (members.length > 0) {
                    desc += `${s.emoji} **${s.name}**: ${members.map(id => `<@${id}>`).join(', ')}\n`;
                }
            });

            embed.setDescription(desc);
            return embed;
        }

        // Генерация меню выбора роли
        function generateRoleMenu(isEnded = false) {
            if (isEnded) return [];

            const roleMenu = new StringSelectMenuBuilder()
                .setCustomId('select_role')
                .setPlaceholder(state.locked ? 'Переходы закрыты' : 'Выберите вашу роль')
                .setDisabled(state.locked);

            roles.forEach(r => {
                const isFull = r.limit > 0 && state.roles[r.id].length >= r.limit;
                roleMenu.addOptions({
                    label: r.name,
                    description: isFull ? 'Мест нет' : `Занято: ${state.roles[r.id].length}/${r.limit > 0 ? r.limit : '∞'}`,
                    value: `role_${r.id}`,
                    emoji: r.emoji,
                    // Если места нет, мы не блокируем кнопку, чтобы можно было перезаписаться, 
                    // но в обработчике проверим лимит
                });
            });

            return [new ActionRowBuilder().addComponents(roleMenu)];
        }

        // Генерация кнопок статусов (в 2 ряда из-за лимита)
        function generateStatusButtons(isEnded = false) {
            if (isEnded) return [];

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('status_bench').setLabel('Скамейка').setEmoji('🪑').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('status_late').setLabel('Поздно').setEmoji('⏰').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('status_prelim').setLabel('Предварительный').setEmoji('⚖️').setStyle(ButtonStyle.Secondary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('status_absent').setLabel('Отсутствие').setEmoji('⛔').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('gather_settings').setEmoji('⚙️').setStyle(ButtonStyle.Primary) // Шестеренка
            );
            return [row1, row2];
        }

        // Отправка сообщения
        const response = await interaction.reply({ 
            embeds: [generateEmbed()], 
            components: [...generateRoleMenu(), ...generateStatusButtons()],
            fetchReply: true 
        });

        const collector = response.createMessageComponentCollector({ time: 86400000 });

        collector.on('collect', async i => {
            // Обработка меню ролей
            if (i.customId === 'select_role') {
                if (state.locked) return i.reply({ content: 'Создатель закрыл переходы.', ephemeral: true });
                
                const selectedRoleId = i.values[0].split('_')[1];
                const userId = i.user.id;
                
                // Убираем пользователя из всех ролей и статусов (чтобы не дублировался)
                roles.forEach(r => state.roles[r.id] = state.roles[r.id].filter(id => id !== userId));
                statuses.forEach(s => state.statuses[s.id] = state.statuses[s.id].filter(id => id !== userId));

                // Проверка лимита
                const roleObj = roles.find(r => r.id === selectedRoleId);
                if (roleObj.limit > 0 && state.roles[selectedRoleId].length >= roleObj.limit) {
                    return i.reply({ content: `Роль **${roleObj.name}** уже заполнена!`, ephemeral: true });
                }

                // Добавляем в роль
                state.roles[selectedRoleId].push(userId);
                
                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            // Обработка статусов
            if (i.customId.startsWith('status_')) {
                const statusId = i.customId.split('_')[1];
                const userId = i.user.id;

                // Проверяем, есть ли он там
                if (state.statuses[statusId].includes(userId)) {
                    state.statuses[statusId] = state.statuses[statusId].filter(id => id !== userId); // Убираем
                } else {
                    // Убираем из ролей и других статусов
                    roles.forEach(r => state.roles[r.id] = state.roles[r.id].filter(id => id !== userId));
                    statuses.forEach(s => state.statuses[s.id] = state.statuses[s.id].filter(id => id !== userId));
                    
                    state.statuses[statusId].push(userId); // Добавляем
                }
                
                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            // Обработка шестеренки (настройки создателя)
            if (i.customId === 'gather_settings') {
                if (i.user.id !== creatorId) return i.reply({ content: 'Только создатель может открыть настройки!', ephemeral: true });

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('toggle_lock').setLabel(state.locked ? 'Открыть переходы' : 'Закрыть переходы').setEmoji('🔒').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('end_gather').setLabel('Завершить сбор').setEmoji('🏁').setStyle(ButtonStyle.Success)
                );

                await i.reply({ content: '⚙️ **Панель управления**', components: [btnRow], ephemeral: true });
            }

            // Кнопки из панели управления
            if (i.customId === 'toggle_lock' || i.customId === 'end_gather') {
                if (i.user.id !== creatorId) return;
                
                if (i.customId === 'toggle_lock') {
                    state.locked = !state.locked;
                    await i.update({ content: state.locked ? '🔒 Переходы закрыты!' : '🔓 Переходы открыты!', components: [] });
                }
                if (i.customId === 'end_gather') {
                    collector.stop('ended');
                    await i.update({ content: '🏁 Сбор завершен!', components: [] });
                }
                await response.edit({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'ended') response.edit({ embeds: [generateEmbed(true)], components: [] });
        });
    },
};
