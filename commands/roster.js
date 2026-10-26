const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models'); // Импортируем настройки из БД для проверки прав

// Временное хранилище состояния настройки для каждого пользователя
const setupStates = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('список')
        .setDescription('Создать красивый список участников с распределением по ролям (колонкам)'),

    async execute(interaction) {
        // --- ПРОВЕРКА ПРАВ ---
        const hasDiscordPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        let hasCustomPerm = false;
        
        try {
            const guildSettings = await Settings.findOne({ guildId: interaction.guild.id });
            if (guildSettings && guildSettings.modRoles) {
                hasCustomPerm = interaction.member.roles.cache.some(role => guildSettings.modRoles.includes(role.id));
            }
        } catch (e) {
            console.error("Ошибка при проверке прав из БД:", e);
        }

        if (!hasDiscordPerm && !hasCustomPerm) {
            return interaction.reply({ content: 'У вас нет прав для использования этой команды! (Требуются права модератора)', ephemeral: true });
        }
        // ---------------------

        const userId = interaction.user.id;
        
        // Инициализируем состояние для пользователя
        setupStates.set(userId, {
            columns: [], // Массив: { name: string, roleId: string }
            tempRoleId: null,
            tempRoleName: null
        });

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Настройка списка участников')
            .setDescription('Здесь вы можете добавить до 10 колонок (ролей).\n\nНажмите **«Добавить колонку»**, чтобы начать.')
            .setColor('#5865F2');

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_column').setLabel('Добавить колонку').setEmoji('➕').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('finish_setup').setLabel('Завершить и отправить').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(true)
        );

        const response = await interaction.reply({ embeds: [embed], components: [btnRow], ephemeral: true });

        const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 минут на настройку

        collector.on('collect', async i => {
            if (i.user.id !== userId) return;
            const state = setupStates.get(userId);

            // --- ШАГ 1: НАЖАТИЕ НА "ДОБАВИТЬ КОЛОНКУ" ---
            if (i.customId === 'add_column') {
                if (state.columns.length >= 10) {
                    return i.reply({ content: 'Максимум 10 колонок!', ephemeral: true });
                }

                // Показываем меню выбора ролей
                const roleMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_role')
                    .setPlaceholder('Выберите роль для этой колонки')
                    .addOptions(interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed).map(r => ({
                        label: r.name, value: r.id
                    })).slice(0, 25)); // Лимит Дискорда - 25 опций

                await i.update({ 
                    content: '**Шаг 1:** Выберите роль, участники которой будут в этой колонке:', 
                    embeds: [], 
                    components: [new ActionRowBuilder().addComponents(roleMenu)] 
                });
            }

            // --- ШАГ 2: ВЫБОР РОЛИ ---
            if (i.customId === 'select_role') {
                state.tempRoleId = i.values[0];
                state.tempRoleName = interaction.guild.roles.cache.get(state.tempRoleId).name;

                await i.update({ 
                    content: `**Шаг 2:** Роль **${state.tempRoleName}** выбрана.\n\nТеперь **напишите в этот чат** название для этой колонки (можете использовать эмодзи, например: \`⚔️ ДД\` или \`:tank_icon: Танки\`).\nУ вас 60 секунд.`, 
                    components: [] 
                });

                // Ловим сообщение от пользователя
                const msgFilter = m => m.author.id === userId;
                const msgCollector = interaction.channel.createMessageCollector({ filter: msgFilter, max: 1, time: 60000 });

                msgCollector.on('collect', async m => {
                    const columnName = m.content;
                    await m.delete().catch(() => {}); // Удаляем сообщение пользователя из чата, чтобы не мусорить

                    state.columns.push({ name: columnName, roleId: state.tempRoleId });

                    const currentList = state.columns.map((c, idx) => `${idx + 1}. ${c.name} (${interaction.guild.roles.cache.get(c.roleId).name})`).join('\n');

                    const nextEmbed = new EmbedBuilder()
                        .setTitle('🛠️ Настройка списка участников')
                        .setDescription(`**Текущие колонки:**\n${currentList}\n\nДобавьте следующую колонку или завершите настройку.`)
                        .setColor('#5865F2');

                    const nextRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('add_column').setLabel('Добавить еще').setEmoji('➕').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('finish_setup').setLabel('Завершить и отправить').setEmoji('✅').setStyle(ButtonStyle.Success)
                    );

                    await i.editReply({ content: 'Колонка успешно добавлена!', embeds: [nextEmbed], components: [nextRow] });
                });

                msgCollector.on('end', collected => {
                    if (collected.size === 0) {
                        i.editReply({ content: 'Время вышло. Настройка отменена.', components: [] });
                    }
                });
            }

            // --- ШАГ 3: ЗАВЕРШЕНИЕ И ГЕНЕРАЦИЯ СПИСКА ---
            if (i.customId === 'finish_setup') {
                if (state.columns.length === 0) return;

                await i.update({ content: '⏳ Собираю данные с сервера...', components: [] });

                // Получаем всех участников сервера (требуется Server Members Intent)
                const members = await interaction.guild.members.fetch();
                
                // Собираем данные
                const memberRolesMap = new Map(); // memberId -> Set(columnNames)
                const columnData = state.columns.map(col => {
                    const membersWithRole = members.filter(m => !m.user.bot && m.roles.cache.has(col.roleId));
                    return { ...col, members: membersWithRole };
                });

                // Заполняем карту для поиска мультиклассов
                columnData.forEach(col => {
                    col.members.forEach(m => {
                        if (!memberRolesMap.has(m.id)) memberRolesMap.set(m.id, new Set());
                        memberRolesMap.get(m.id).add(col.name);
                    });
                });

                const totalUnique = memberRolesMap.size;

                const finalEmbed = new EmbedBuilder()
                    .setTitle('🛡️ Состав гильдии')
                    .setDescription(`**Всего участников (уникальных):** ${totalUnique}\n\n🌐 — участник имеет несколько ролей из списка (мультикласс)`)
                    .setColor('#2b2d31')
                    .setTimestamp();

                // Формируем колонки
                columnData.forEach(col => {
                    // Сортируем по алфавиту
                    const sortedMembers = Array.from(col.members.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
                    
                    let membersStr = '';
                    if (sortedMembers.length === 0) {
                        membersStr = '*Никого нет*';
                    } else {
                        // Ограничиваем до 20 человек, чтобы не сломать лимит Embed
                        membersStr = sortedMembers.slice(0, 20).map(m => {
                            const hasMultiple = memberRolesMap.get(m.id).size > 1;
                            return `<@${m.id}>${hasMultiple ? ' 🌐' : ''}`;
                        }).join('\n');
                        
                        if (sortedMembers.length > 20) {
                            membersStr += `\n*...и еще ${sortedMembers.length - 20}*`;
                        }
                    }

                    finalEmbed.addFields({ 
                        name: `${col.name} (${sortedMembers.length})`, 
                        value: membersStr, 
                        inline: true 
                    });
                });

                // Отправляем в канал (уже не приватно)
                await interaction.channel.send({ embeds: [finalEmbed] });
                await i.editReply({ content: '✅ Список успешно создан и отправлен в чат!', components: [] });
                
                setupStates.delete(userId); // Очищаем память
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: 'Время настройки истекло. Попробуйте снова.', components: [] }).catch(() => {});
                setupStates.delete(userId);
            }
        });
    },
};
