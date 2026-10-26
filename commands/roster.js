const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Settings } = require('../models'); 

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
            return interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
        }

        const userId = interaction.user.id;
        setupStates.set(userId, { columns: [], tempRoleId: null, tempRoleName: null });

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Настройка списка участников')
            .setDescription('Здесь вы можете добавить до 10 колонок (ролей).\n\nНажмите **«Добавить колонку»**, чтобы начать.')
            .setColor('#5865F2');

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_column').setLabel('Добавить колонку').setEmoji('➕').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('finish_setup').setLabel('Завершить и отправить').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(true)
        );

        const response = await interaction.reply({ embeds: [embed], components: [btnRow], ephemeral: true });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return;
            const state = setupStates.get(userId);

            if (i.customId === 'add_column') {
                if (state.columns.length >= 10) return i.reply({ content: 'Максимум 10 колонок!', ephemeral: true });

                const roleMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_role')
                    .setPlaceholder('Выберите роль для этой колонки')
                    .addOptions(interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed).map(r => ({
                        label: r.name, value: r.id
                    })).slice(0, 25));

                await i.update({ content: '**Шаг 1:** Выберите роль:', embeds: [], components: [new ActionRowBuilder().addComponents(roleMenu)] });
            }

            if (i.customId === 'select_role') {
                state.tempRoleId = i.values[0];
                state.tempRoleName = interaction.guild.roles.cache.get(state.tempRoleId).name;

                await i.update({ 
                    content: `**Шаг 2:** Роль **${state.tempRoleName}** выбрана.\n\nНапишите в чат название для этой колонки (можно с эмодзи). У вас 60 секунд.`, 
                    components: [] 
                });

                const msgCollector = interaction.channel.createMessageCollector({ filter: m => m.author.id === userId, max: 1, time: 60000 });

                msgCollector.on('collect', async m => {
                    await m.delete().catch(() => {});
                    state.columns.push({ name: m.content, roleId: state.tempRoleId });

                    const currentList = state.columns.map((c, idx) => `${idx + 1}. ${c.name}`).join('\n');
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
            }

            if (i.customId === 'finish_setup') {
                if (state.columns.length === 0) return;

                await i.update({ content: '⏳ Собираю список участников...', components: [] });

                try {
                    const memberRolesMap = new Map();
                    const columnData = [];

                    // Проходимся по каждой выбранной роли
                    for (const col of state.columns) {
                        const role = interaction.guild.roles.cache.get(col.roleId);
                        if (!role) continue;

                        // 1. Берем участников из кэша
                        let roleMembers = Array.from(role.members.values()).filter(m => !m.user.bot);

                        // 2. Если кэш пуст (бот перезапускался), принудительно запрашиваем ТОЛЬКО эту роль
                        if (roleMembers.length === 0) {
                            try {
                                console.log(`Запрос участников для роли: ${role.name}`);
                                // Увеличиваем таймаут до 30 секунд для надежности
                                await interaction.guild.members.fetch({ role: role.id, time: 30000 });
                                roleMembers = Array.from(role.members.values()).filter(m => !m.user.bot);
                            } catch (fetchError) {
                                console.log(`Не удалось загрузить роль ${role.name} (таймаут). Используем кэш.`);
                            }
                        }
                        
                        columnData.push({ ...col, members: roleMembers });

                        roleMembers.forEach(m => {
                            if (!memberRolesMap.has(m.id)) memberRolesMap.set(m.id, new Set());
                            memberRolesMap.get(m.id).add(col.name);
                        });
                    }

                    const totalUnique = memberRolesMap.size;

                    const finalEmbed = new EmbedBuilder()
                        .setTitle('🛡️ Состав гильдии')
                        .setDescription(`**Всего участников (уникальных):** ${totalUnique}\n\n🔹 — участник имеет несколько ролей из списка (мультикласс)`)
                        .setColor('#2b2d31')
                        .setTimestamp();

                    columnData.forEach(col => {
                        const sortedMembers = Array.from(col.members.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
                        
                        let membersStr = '*Никого нет*';
                        if (sortedMembers.length > 0) {
                            membersStr = sortedMembers.slice(0, 20).map(m => {
                                const hasMultiple = memberRolesMap.get(m.id).size > 1;
                                return `<@${m.id}>${hasMultiple ? ' 🔹' : ''}`;
                            }).join('\n');
                            if (sortedMembers.length > 20) membersStr += `\n*...и еще ${sortedMembers.length - 20}*`;
                        }

                        finalEmbed.addFields({ name: `${col.name} (${sortedMembers.length})`, value: membersStr, inline: true });
                    });

                    await interaction.channel.send({ embeds: [finalEmbed] });
                    await i.editReply({ content: '✅ Список успешно создан!', components: [] });
                    
                } catch (error) {
                    console.error("Критическая ошибка:", error);
                    await i.editReply({ content: '❌ Произошла ошибка. Попробуйте еще раз.', components: [] });
                }
                
                setupStates.delete(userId);
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: 'Время настройки истекло.', components: [] }).catch(() => {});
                setupStates.delete(userId);
            }
        });
    },
};
