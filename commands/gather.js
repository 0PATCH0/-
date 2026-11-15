const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { Gather } = require('../models');

// Глобальный кэш таймеров, чтобы не плодить их
const activeTimers = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сбор')
        .setDescription('Создать продвинутый сбор на ивент')
        .addStringOption(option => option.setName('название').setDescription('Название ивента').setRequired(true))
        .addIntegerOption(option => option.setName('часовой_пояс').setDescription('Твой часовой пояс (например: 3)').setRequired(true).setMinValue(-12).setMaxValue(14))
        .addStringOption(option => option.setName('время').setDescription('Время по твоему поясу (например, 18:40)').setRequired(true))
        .addIntegerOption(option => option.setName('лимит_всего').setDescription('Общий лимит участников (0 - без лимита)').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_танков').setDescription('Сколько Танков?').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_дд').setDescription('Сколько ДД?').setRequired(false))
        .addIntegerOption(option => option.setName('лимит_хилов').setDescription('Сколько Хилов?').setRequired(false))
        .addIntegerOption(option => option.setName('пинг_за_минут').setDescription('За сколько минут пинговать?').setRequired(false))
        .addMentionableOption(option => option.setName('кого_пинговать').setDescription('Доп. тег к пингу').setRequired(false))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('название');
        const timezone = interaction.options.getInteger('часовой_пояс');
        const timeString = interaction.options.getString('время');
        const totalLimit = interaction.options.getInteger('лимит_всего') || 0;
        const limitTank = interaction.options.getInteger('лимит_танков') || 0;
        const limitDps = interaction.options.getInteger('лимит_дд') || 0;
        const limitHeal = interaction.options.getInteger('лимит_хилов') || 0;
        const pingMinutes = interaction.options.getInteger('пинг_за_минут') || 0;
        const pingTarget = interaction.options.getMentionable('кого_пинговать');
        const image = interaction.options.getString('картинка');
        const creatorId = interaction.user.id;

        const timeParts = timeString.split(':');
        const hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]) || 0;

        const now = new Date();
        const eventDate = new Date();
        eventDate.setUTCHours(hours - timezone, minutes, 0, 0);
        if (eventDate.getTime() <= now.getTime()) eventDate.setUTCDate(eventDate.getUTCDate() + 1);
        const eventTimestamp = Math.floor(eventDate.getTime() / 1000);

        const roles = [
            { id: 'tank', name: 'Tank', emoji: '🛡️', limit: limitTank },
            { id: 'dps', name: 'Dps', emoji: '⚔️', limit: limitDps },
            { id: 'healer', name: 'Healer', emoji: '💚', limit: limitHeal }
        ];

        const statuses = [
            { id: 'bench', name: 'Скамейка', emoji: '🪑' },
            { id: 'late', name: 'Поздно', emoji: '⏰' },
            { id: 'absent', name: 'Отсутствие', emoji: '⛔' }
        ];

        // Создаем запись в базе
        const gather = await Gather.create({
            messageId: 'temp', // Обновим после отправки
            channelId: interaction.channelId,
            guildId: interaction.guildId,
            creatorId: creatorId,
            title: title,
            eventTimestamp: eventTimestamp,
            pingMinutes: pingMinutes,
            pingTarget: pingTarget ? pingTarget.id : null,
            roles: { tank: [], dps: [], healer: [] },
            statuses: { bench: [], late: [], absent: [] },
            locked: false,
            isEnded: false,
            hasPinged: false
        });

        // Функция генерации эмбеда (использует данные из объекта gather)
        function generateEmbed(isEnded = false) {
            const embed = new EmbedBuilder()
                .setTitle(`Десятки / ${gather.title}`)
                .setColor(isEnded ? '#2f3136' : '#9b59b6')
                .setFooter({ text: isEnded ? 'Сбор завершен' : (gather.locked ? 'Переходы закрыты' : 'Сбор открыт'), iconURL: interaction.user.displayAvatarURL() });

            if (image) embed.setImage(image);

            let totalPlayers = 0;
            roles.forEach(r => {
                totalPlayers += gather.roles[r.id].length;
            });

            let desc = `🏳️ **Создатель:** <@${gather.creatorId}>\n`;
            desc += `🕒 **Начало:** <t:${gather.eventTimestamp}:t> (<t:${gather.eventTimestamp}:R>)\n\n`;
            desc += `🚗 **Участников:** ${totalPlayers} ${totalLimit > 0 ? `/ ${totalLimit}` : ''}\n`;

            if (gather.pingMinutes > 0 && !isEnded) {
                const pingUnix = gather.eventTimestamp - (gather.pingMinutes * 60);
                desc += `🔔 **Оповещение:** <t:${pingUnix}:t>\n`;
            }
            desc += `\n`;

            roles.forEach(r => {
                const members = gather.roles[r.id];
                const membersStr = members.length > 0 ? members.map((id, i) => `\`${i + 1}\` <@${id}>`).join('\n') : '*Пусто*';
                desc += `**${r.emoji} ${r.name} (${members.length}${r.limit > 0 ? `/${r.limit}` : ''})**\n${membersStr}\n\n`;
            });

            desc += `──────────────\n`;
            statuses.forEach(s => {
                if (gather.statuses[s.id].length > 0) desc += `${s.emoji} **${s.name}**: ${gather.statuses[s.id].map(id => `<@${id}>`).join(', ')}\n`;
            });

            embed.setDescription(desc);
            return embed;
        }

        function generateRoleMenu(isEnded = false) {
            if (isEnded) return [];
            const menu = new StringSelectMenuBuilder().setCustomId('select_role').setPlaceholder(gather.locked ? 'Переходы закрыты' : 'Выберите вашу роль').setDisabled(gather.locked);
            roles.forEach(r => menu.addOptions({ label: r.name, description: `Занято: ${gather.roles[r.id].length}/${r.limit > 0 ? r.limit : '∞'}`, value: `role_${r.id}`, emoji: r.emoji }));
            return [new ActionRowBuilder().addComponents(menu)];
        }

        function generateStatusButtons(isEnded = false) {
            if (isEnded) return [];
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('status_bench').setLabel('Скамейка').setEmoji('🪑').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('status_late').setLabel('Поздно').setEmoji('⏰').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('status_absent').setLabel('Отсутствие').setEmoji('⛔').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('gather_settings').setEmoji('⚙️').setStyle(ButtonStyle.Primary)
            )];
        }

        const response = await interaction.reply({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()], fetchReply: true });
        
        // Обновляем messageId в базе
        gather.messageId = response.id;
        await gather.save();

        const collector = response.createMessageComponentCollector({ time: 86400000 });

        collector.on('collect', async i => {
            // Перечитываем сбор из базы на случай, если что-то изменилось
            const dbGather = await Gather.findOne({ messageId: response.id });
            if (!dbGather || dbGather.isEnded) {
                return i.reply({ content: 'Этот сбор уже завершен.', ephemeral: true });
            }

            if (i.customId === 'select_role') {
                if (dbGather.locked) return i.reply({ content: 'Создатель закрыл переходы.', ephemeral: true });
                const selectedRoleId = i.values[0].split('_')[1];
                const userId = i.user.id;

                let totalPlayers = Object.values(dbGather.roles).flat().length;
                const isAlreadyIn = Object.values(dbGather.roles).flat().includes(userId);
                if (totalLimit > 0 && totalPlayers >= totalLimit && !isAlreadyIn) return i.reply({ content: 'Сбор полностью заполнен!', ephemeral: true });

                // Удаляем из всех ролей и статусов
                roles.forEach(r => dbGather.roles[r.id] = dbGather.roles[r.id].filter(id => id !== userId));
                statuses.forEach(s => dbGather.statuses[s.id] = dbGather.statuses[s.id].filter(id => id !== userId));

                const roleObj = roles.find(r => r.id === selectedRoleId);
                if (roleObj.limit > 0 && dbGather.roles[selectedRoleId].length >= roleObj.limit) return i.reply({ content: `Роль **${roleObj.name}** уже заполнена!`, ephemeral: true });

                dbGather.roles[selectedRoleId].push(userId);
                dbGather.markModified('roles');
                dbGather.markModified('statuses');
                await dbGather.save();

                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            if (i.customId.startsWith('status_')) {
                const statusId = i.customId.split('_')[1];
                const userId = i.user.id;
                
                if (dbGather.statuses[statusId].includes(userId)) {
                    dbGather.statuses[statusId] = dbGather.statuses[statusId].filter(id => id !== userId);
                } else {
                    // Убираем из других мест
                    roles.forEach(r => dbGather.roles[r.id] = dbGather.roles[r.id].filter(id => id !== userId));
                    statuses.forEach(s => dbGather.statuses[s.id] = dbGather.statuses[s.id].filter(id => id !== userId));
                    dbGather.statuses[statusId].push(userId);
                }
                dbGather.markModified('roles');
                dbGather.markModified('statuses');
                await dbGather.save();

                await i.update({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            if (i.customId === 'gather_settings') {
                if (i.user.id !== creatorId) return i.reply({ content: 'Только создатель может открыть настройки!', ephemeral: true });
                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('toggle_lock').setLabel(dbGather.locked ? 'Открыть переходы' : 'Закрыть переходы').setEmoji('🔒').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('end_gather').setLabel('Завершить сбор').setEmoji('🏁').setStyle(ButtonStyle.Success)
                );
                await i.reply({ content: '⚙️ **Панель управления**', components: [btnRow], ephemeral: true });
            }

            if (i.customId === 'toggle_lock') {
                if (i.user.id !== creatorId) return;
                dbGather.locked = !dbGather.locked;
                await dbGather.save();
                await i.update({ content: dbGather.locked ? '🔒 Переходы закрыты!' : '🔓 Переходы открыты!', components: [] });
                await response.edit({ embeds: [generateEmbed()], components: [...generateRoleMenu(), ...generateStatusButtons()] });
            }

            if (i.customId === 'end_gather') {
                if (i.user.id !== creatorId) return;
                await endGather(interaction.client, dbGather, interaction.channel);
                collector.stop('ended');
                await i.update({ content: '🏁 Сбор завершен! Итоги отправлены в чат.', components: [] });
            }
        });

        // Запускаем таймеры
        startGatherTimers(interaction.client, gather, response);
    },
};

// === ФУНКЦИЯ ТАЙМЕРОВ ===
function startGatherTimers(client, gather, message) {
    // Таймер пинга
    if (gather.pingMinutes > 0) {
        const pingTime = gather.eventTimestamp - (gather.pingMinutes * 60);
        const timeUntilPing = (pingTime * 1000) - Date.now();
        
        if (timeUntilPing > 0) {
            const timer = setTimeout(async () => {
                const dbGather = await Gather.findOne({ messageId: gather.messageId });
                if (!dbGather || dbGather.isEnded || dbGather.hasPinged) return;
                
                const channel = await client.channels.fetch(dbGather.channelId).catch(() => null);
                if (channel) {
                    let content = `🔔 **Сбор на "${dbGather.title}" начнется через ${dbGather.pingMinutes} минут!**`;
                    if (dbGather.pingTarget) {
                        content += `\n<@${dbGather.pingTarget}>`;
                    }
                    // Тегаем всех участников
                    const allMembers = [...dbGather.roles.tank, ...dbGather.roles.dps, ...dbGather.roles.healer];
                    if (allMembers.length > 0) {
                        content += `\n${allMembers.map(id => `<@${id}>`).join(', ')}`;
                    }
                    await channel.send({ content });
                    
                    dbGather.hasPinged = true;
                    await dbGather.save();
                }
            }, timeUntilPing);
            activeTimers.set(`ping_${gather.messageId}`, timer);
        }
    }

    // Таймер завершения
    const timeUntilEnd = (gather.eventTimestamp * 1000) - Date.now();
    if (timeUntilEnd > 0) {
        const timer = setTimeout(async () => {
            const dbGather = await Gather.findOne({ messageId: gather.messageId });
            if (!dbGather || dbGather.isEnded) return;
            
            await endGather(client, dbGather, message.channel);
        }, timeUntilEnd);
        activeTimers.set(`end_${gather.messageId}`, timer);
    }
}

// === ФУНКЦИЯ ЗАВЕРШЕНИЯ ===
async function endGather(client, dbGather, channel) {
    if (dbGather.isEnded) return;
    dbGather.isEnded = true;
    await dbGather.save();

    // Чистим таймеры
    if (activeTimers.has(`ping_${dbGather.messageId}`)) clearTimeout(activeTimers.get(`ping_${dbGather.messageId}`));
    if (activeTimers.has(`end_${dbGather.messageId}`)) clearTimeout(activeTimers.get(`end_${dbGather.messageId}`));
    activeTimers.delete(`ping_${dbGather.messageId}`);
    activeTimers.delete(`end_${dbGather.messageId}`);

    // Отправляем итоговое сообщение
    const summaryEmbed = new EmbedBuilder()
        .setTitle(`🏁 Сбор завершен: ${dbGather.title}`)
        .setColor('#2b2d31')
        .setDescription(`Итоговый состав на <t:${dbGather.eventTimestamp}:t>`)
        .setTimestamp();

    const roles = [
        { id: 'tank', name: 'Tank', emoji: '🛡️' },
        { id: 'dps', name: 'Dps', emoji: '⚔️' },
        { id: 'healer', name: 'Healer', emoji: '💚' }
    ];

    roles.forEach(r => {
        const members = dbGather.roles[r.id] || [];
        if (members.length > 0) {
            summaryEmbed.addFields({ name: `${r.emoji} ${r.name}`, value: members.map(id => `<@${id}>`).join(', '), inline: false });
        }
    });

    const msg = await channel.messages.fetch(dbGather.messageId).catch(() => null);
    if (msg) {
        // Обновляем старое сообщение, убираем кнопки
        const oldEmbed = EmbedBuilder.from(msg.embeds[0]).setColor('#2f3136').setFooter({ text: 'Сбор завершен' });
        await msg.edit({ embeds: [oldEmbed], components: [] }).catch(() => {});
    }
    
    await channel.send({ content: '🏁 **Время сбора наступило!**', embeds: [summaryEmbed] }).catch(() => {});
}
