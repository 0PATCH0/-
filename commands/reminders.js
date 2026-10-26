const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../reminders.json');

function loadReminders() {
    if (!fs.existsSync(dbPath)) return [];
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveReminders(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('мои_напоминания')
        .setDescription('Показать, отредактировать или удалить ваши напоминания'),

    async execute(interaction) {
        const reminders = loadReminders();
        const userReminders = reminders.filter(r => r.userId === interaction.user.id);

        if (userReminders.length === 0) {
            return interaction.reply({ content: 'У вас нет активных напоминаний.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Ваши напоминания')
            .setDescription('Выберите действие с помощью кнопок ниже.')
            .setColor('#5865F2');

        userReminders.forEach((r, i) => {
            const timeUnix = Math.floor(r.nextTime / 1000);
            embed.addFields({
                name: `${i + 1}. ${r.text.length > 50 ? r.text.substring(0, 47) + '...' : r.text}`,
                value: `Сработает: <t:${timeUnix}:f> (<t:${timeUnix}:R>)`,
                inline: false
            });
        });

        // Кнопки управления
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_edit').setLabel('Редактировать').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_delete').setLabel('Удалить').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );

        const response = await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
        const collector = response.createMessageComponentCollector({ time: 120000 }); // 2 минуты на действия

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Это не ваши напоминания.', ephemeral: true });

            // --- МЕНЮ УДАЛЕНИЯ ---
            if (i.customId === 'btn_delete') {
                const deleteMenu = new StringSelectMenuBuilder().setCustomId('sel_delete').setPlaceholder('Выберите напоминание для удаления')
                    .addOptions(userReminders.slice(0, 25).map(r => ({ label: r.text.substring(0, 50), value: r.id, emoji: '🗑️' })));
                
                await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(deleteMenu)] });
            }

            // --- МЕНЮ РЕДАКТИРОВАНИЯ ---
            if (i.customId === 'btn_edit') {
                const editMenu = new StringSelectMenuBuilder().setCustomId('sel_edit').setPlaceholder('Выберите напоминание для изменения')
                    .addOptions(userReminders.slice(0, 25).map(r => ({ label: r.text.substring(0, 50), value: r.id, emoji: '✏️' })));

                await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(editMenu)] });
            }

            // --- ОБРАБОТКА УДАЛЕНИЯ ---
            if (i.customId === 'sel_delete') {
                let allReminders = loadReminders();
                allReminders = allReminders.filter(r => r.id !== i.values[0]);
                saveReminders(allReminders);
                await i.update({ content: '✅ Напоминание удалено!', embeds: [], components: [] });
            }

            // --- ОТКРЫТИЕ ОКНА РЕДАКТИРОВАНИЯ (MODAL) ---
            if (i.customId === 'sel_edit') {
                const remindId = i.values[0];
                const reminder = loadReminders().find(r => r.id === remindId);

                // Создаем всплывающее окно
                const modal = new ModalBuilder().setCustomId(`modal_edit_${remindId}`).setTitle('Редактирование напоминания');

                // Поле 1: Текст
                const textInput = new TextInputBuilder().setCustomId('inp_text').setLabel('Новый текст').setStyle(TextInputStyle.Short).setValue(reminder.text).setRequired(true);
                
                // Поле 2: Тег (ID пользователя или роли)
                const targetInput = new TextInputBuilder().setCustomId('inp_target').setLabel('ID пользователя/роли для тега').setStyle(TextInputStyle.Short).setValue(reminder.targetId).setRequired(true);

                // Поле 3: Новое время (Unix Timestamp)
                const timeInput = new TextInputBuilder().setCustomId('inp_time').setLabel('Новое время (Unix Timestamp)').setStyle(TextInputStyle.Short).setValue(reminder.nextTime.toString()).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(textInput),
                    new ActionRowBuilder().addComponents(targetInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );

                // Показываем окно пользователю
                await i.showModal(modal);

                // Ждем заполнения
                try {
                    const modalInteraction = await i.awaitModalSubmit({ time: 60000, filter: m => m.customId === `modal_edit_${remindId}` });
                    
                    const newText = modalInteraction.fields.getTextInputValue('inp_text');
                    const newTargetId = modalInteraction.fields.getTextInputValue('inp_target');
                    const newTime = parseInt(modalInteraction.fields.getTextInputValue('inp_time'));

                    let allReminders = loadReminders();
                    const idx = allReminders.findIndex(r => r.id === remindId);

                    if (idx !== -1) {
                        allReminders[idx].text = newText;
                        allReminders[idx].targetId = newTargetId;
                        allReminders[idx].nextTime = newTime;
                        allReminders[idx].warned = false; // Сброс предупреждения
                        saveReminders(allReminders);
                        
                        // Перезапускаем таймер, но для простоты попросим перезапустить бота, 
                        // так как старый setTimeout остался висеть.
                        await modalInteraction.reply({ content: '✅ Напоминание обновлено! (Для применения нового таймера может потребоваться перезапуск бота)', ephemeral: true });
                    }
                } catch (e) {
                    console.log('Пользователь закрыл окно редактирования.');
                }
            }
        });
    },
};
