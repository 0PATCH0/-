const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сбор')
        .setDescription('Создать продвинутый сбор на ивент')
        .addStringOption(option => option.setName('название').setDescription('Название ивента').setRequired(true))
        
        // ЧАСОВОЙ ПОЯС И ВРЕМЯ
        .addIntegerOption(option => option.setName('часовой_пояс').setDescription('Твой часовой пояс (например: 3 для Москвы, 2 для Киева)').setRequired(true).setMinValue(-12).setMaxValue(14))
        .addStringOption(option => option.setName('время').setDescription('Время по твоему поясу (например, 18:40)').setRequired(true))
        
        // ЛИМИТЫ РОЛЕЙ
        .addIntegerOption(option => option.setName('лимит_всего').setDescription('Общий лимит участников на сбор (0 - без лимита)').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_танков').setDescription('Сколько Танков?').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_дд').setDescription('Сколько ДД?').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_хилов').setDescription('Сколько Хилов?').setRequired(false))
        
        // УПОМИНАНИЯ
        .addIntegerOption(option => option.setName('пинг_за_минут').setDescription('За сколько минут до старта пинговать всех? (если 0 - без пинга)').setRequired(false))
        .addMentionableOption(option => option.setName('кого_пинговать').setDescription('Дополнительный тег (роль или человек) к общему пингу').setRequired(false))
        
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('название');
        const timezone = interaction.options.getInteger('часовой_пояс');
        const timeString = interaction.options.getString('время'); // "18:40"
        
        const totalLimit = interaction.options.getInteger('лимит_всего') || 0;
        const limitTank = interaction.options.getInteger('лимит_танков') || 0;
        const limitDps = interaction.options.getInteger('лимит_дд') || 0;
        const limitHeal = interaction.options.getInteger('лимит_хилов') || 0;
        
        const pingMinutes = interaction.options.getInteger('пинг_за_минут') || 0;
        const pingTarget = interaction.options.getMentionable('кого_пинговать'); // Может быть null
        const image = interaction.options.getString('картинка');
        const creatorId = interaction.user.id;

        // Вычисляем время начала сбора в Unix Timestamp
        const timeParts = timeString.split(':');
        const hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]) || 0;

        const now = new Date();
        const eventDate = new Date();
        eventDate.setUTCHours(hours - timezone, minutes, 0, 0);
        
        if (eventDate.getTime() <= now.getTime()) {
            eventDate.setUTCDate(eventDate.getUTCDate() + 1);
        }
        const eventTimestamp = Math.floor(eventDate.getTime() / 1000);

        const roles = [
            { id: 'tank', name: 'Tank', emoji: '<:emoji_5:1564349905571684494>', limit: limitTank },
            { id: 'dps', name: 'Dps', emoji: '<:emoji_6:1564349962198843452>', limit: limitDps },
            { id: 'healer', name: 'Healer', emoji: '<:emoji_4:1564349852375060541>', limit: limitHeal }
        ];

        const statuses = [
            { id: 'bench', name: 'Скамейка', emoji: '🪑' },
            { id: 'late', name: 'Поздно', emoji: '⏰' },
            { id: 'absent', name: 'Отсутствие', emoji: '⛔' }
        ];

        const state = { locked: false, roles: {}, statuses: {} };
        roles.forEach(r => state.roles[r.id] = []);
        statuses.forEach(s => state.statuses[s.id] = []);

        // ================= ГЕНЕРАЦИЯ EMBED =================
        function generateEmbed(isEnded = false) {
            const embed = new EmbedBuilder()
                .setTitle(` ${title}`)
                .setColor(isEnded ? '#2f3136' : '#9b59b6')
                .setFooter({ text: isEnded ? 'Сбор завершен' : (state.locked ? 'Переходы закрыты' : 'Сбор открыт'), iconURL: interaction.user.displayAvatarURL() });

            if (image) embed.setImage(image);

            let totalPlayers = 0;
            let maxPlayers = 0;
            roles.forEach(r => {
                totalPlayers += state.roles[r.id].length;
                if (r.limit > 0) maxPlayers += r.limit;
            });

            let desc = `🏳️ **Создатель:** <@${creatorId}>\n`;
            desc += `🕒 **Начало:** <t:${eventTimestamp}:t> (<t:${eventTimestamp}:R>)\n\n`;
            
            desc += `🚗 **Участников:** ${totalPlayers} ${totalLimit > 0 ? `/ ${totalLimit}` : ''}\n`;
            if (pingMinutes > 0 && !isEnded) {
                const pingUnix = eventTimestamp - (pingMinutes * 60);
                desc += `🔔 **Оповещение:** <t:${pingUnix}:t> (за ${pingMinutes} мин)\n`;
            }
            desc += `\n`;

            roles.forEach(r => {
                const members = state.roles[r.id];
                const membersStr = members.length > 0 ? members.map((id, i) => `\`${i + 1}\` <@${id}>`).join('\n') : '*Пусто*';
                const roleLimitStr = r.limit > 0 ? `/${r.limit}` : '';
                desc += `**${r.emoji} ${r.name} (${members.length}${roleLimitStr})**\n${membersStr}\n\n`;
            });

            desc += `──────────────\n`;
            statuses.forEach(s => {
                if (state.statuses[s.id].length > 0) {
                    desc += `${s.emoji} **${s.name}**: ${state.statuses[s.id].map(id => `<@${id}>`).join(', ')}\n`;
                }
            });

            embed.setDescription(desc);
            return embed;
        }

        // ================= МЕНЮ РОЛЕЙ =================
        function generateRoleMenu(isEnded = false) {
            if (isEnded) return [];
            const menu = new StringSelectMenuBuilder()
                .setCustomId('select_role')
                .setPlaceholder(state.locked ? 'Переходы закрыты' : 'Выберите вашу роль')
                .setDisabled(state.locked);

            roles.forEach(r => {
                menu.addOptions({
                    label: r.name,
                    description: `Занято: ${state.roles[r.id].length}/${r.limit > 0 ? r.limit : '∞'}`,
                    value: `role_${r.id}`,
                    emoji: r.emoji
                });
            });
            return [new ActionRowBuilder().addComponents(menu)];
        }

        // ================= КНОПКИ СТАТУСОВ =================
        function generateStatusButtons(isEnded = false) {
            if (isEnded) return [];
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('status_bench').setLabel('Скамейка').setEmoji('🪑').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('status_late').setLabel('Поздно').setEmoji('⏰').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('status_absent').setLabel('Отсутствие').setEmoji('⛔').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('gather_settings').setEmoji('⚙️').setStyle(ButtonStyle.Primary)
                )
            ];
        }

        const response = await interaction.reply({ 
            embeds: [generateEmbed()], 
            components: [...generateRoleMenu(), ...generateStatusButtons()],
            fetchReply: true 
        });

        // ================= ТАЙМЕР ПИНГА (ОБНОВЛЕННЫЙ) =================
        let pingTimeout = null;
        if (pingMinutes > 0) {
            const timeToPing = eventDate.getTime() - (pingMinutes * 60 * 1000) - Date.now();
            if (timeToPing > 0) {
                pingTimeout = setTimeout(async () => {
                    // Собираем всех участников из всех ролей
                    let allMembers = [];
                    roles.forEach(r => allMembers.push(...state.roles[r.id]));
                    
                    // Собираем тех, кто на скамейке и "поздно" (их тоже нужно тегнуть)
                    allMembers.push(...state.statuses['bench']);
                    allMembers.push(...state.statuses['late']);

                    // Убираем дубликаты
                    allMembers = [...new Set(allMembers)];

                    if (allMembers.length === 0) {
                        return interaction.channel.send({ content: `⏰ До сбора \`${title}\` осталось ${pingMinutes} минут, но пока никто не записался!` });
                    }

                    const pingList = allMembers.slice(0, 50).map(id => `<@${id}>`).join(', ');
                    const extraText = allMembers.length > 50 ? ` и еще ${allMembers.length - 50} человек...` : '';
                    
                    // Добавляем упоминание роли/человека, если указано
                    let extraPing = '';
                    if (pingTarget) {
                        extraPing = pingTarget.user ? `<@${pingTarget.id}> ` : `<@&${pingTarget.id}> `;
                    }

                    await interaction.channel.send({ 
                        content: `${extraPing}\n⏰ **До начала сбора \`${title}\` осталось ${pingMinutes} минут!**\n\n**Участники:** ${pingList}${extraText}\nНе забудьте зайти в игру!` 
                    });
                }, timeToPing);
            }
        }

        // ================= СБОРЩИК КЛИКОВ =================
        const collector = response.createMessageComponentCollector({ time: 86400000 });

        collector.on('collect', async i => {
            // --- ВЫБОР РОЛИ ---
            if (i.customId === 'select_role') {
                if (state.locked) return i.reply({ content: 'Создатель закрыл переходы.', ephemeral: true });
                
                const selectedRoleId = i.values[0].split('_')[1];
                const userId = i.user.id;
                
                let totalPlayers = Object.values(state.roles).flat().length;
                const isAlreadyIn = Object.values(state.roles).flat().includes(userId);
                
                if (totalLimit > 0 && totalPlayers >= totalLimit && !isAlreadyIn) {
                    return i.reply({ content: 'Сбор полностью заполнен!', ephemeral: true });
                }

                roles.forEach(r => state.roles[r.id] = state.roles[r.id].filter(id => id !== userId));
                statuses.forEach(s => state.statuses[s.id] = state.statuses[s.id].filter(id => id !== userId));

                const roleObj = roles.find(r => r.id === selectedRoleId);
                if (roleObj.limit > 0 && state.roles[selectedRoleId].length >= roleObj.limit) {
                    return i.reply({ content: `Роль **${roleObj.name}** уже заполнена!`, ephemeral: true });
                }

                state.roles[selectedRoleId].push(userId);
                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            // --- СТАТУСЫ ---
            if (i.customId.startsWith('status_')) {
                const statusId = i.customId.split('_')[1];
                const userId = i.user.id;

                if (state.statuses[statusId].includes(userId)) {
                    state.statuses[statusId] = state.statuses[statusId].filter(id => id !== userId);
                } else {
                    roles.forEach(r => state.roles[r.id] = state.roles[r.id].filter(id => id !== userId));
                    statuses.forEach(s => state.statuses[s.id] = state.statuses[s.id].filter(id => id !== userId));
                    state.statuses[statusId].push(userId);
                }
                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            // --- НАСТРОЙКИ ---
            if (i.customId === 'gather_settings') {
                if (i.user.id !== creatorId) return i.reply({ content: 'Только создатель может открыть настройки!', ephemeral: true });

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('toggle_lock').setLabel(state.locked ? 'Открыть переходы' : 'Закрыть переходы').setEmoji('🔒').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('end_gather').setLabel('Завершить сбор').setEmoji('🏁').setStyle(ButtonStyle.Success)
                );
                await i.reply({ content: '⚙️ **Панель управления**', components: [btnRow], ephemeral: true });
            }

            if (i.customId === 'toggle_lock' || i.customId === 'end_gather') {
                if (i.user.id !== creatorId) return;
                if (i.customId === 'toggle_lock') {
                    state.locked = !state.locked;
                    await i.update({ content: state.locked ? '🔒 Переходы закрыты!' : '🔓 Переходы открыты!', components: [] });
                }
                if (i.customId === 'end_gather') {
                    collector.stop('ended');
                    if (pingTimeout) clearTimeout(pingTimeout); // Отменяем пинг, если сбор отменен
                    await i.update({ content: '🏁 Сбор завершен!', components: [] });
                }
                await response.edit({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'ended') {
                if (pingTimeout) clearTimeout(pingTimeout);
                response.edit({ embeds: [generateEmbed(true)], components: [] });
            }
        });
    },
};
