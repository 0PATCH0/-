const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Reminder } = require('../models'); // Импорт БД

module.exports = {
    data: new SlashCommandBuilder()
        .setName('мои_напоминания')
        .setDescription('Показать, отредактировать или удалить ваши напоминания'),

    async execute(interaction) {
        // Ищем только свои напоминания
        const userReminders = await Reminder.find({ userId: interaction.user.id });

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

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_edit').setLabel('Редактировать').setEmoji('✏️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_delete').setLabel('Удалить').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );

        const response = await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
        const collector = response.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Это не ваши напоминания.', ephemeral: true });

            // --- УДАЛЕНИЕ ---
            if (i.customId === 'btn_delete') {
                const deleteMenu = new StringSelectMenuBuilder().setCustomId('sel_delete').setPlaceholder('Выберите напоминание для удаления')
                    .addOptions(userReminders.slice(0, 25).map(r => ({ label: r.text.substring(0, 50), value: r.id, emoji: '🗑️' })));
                
                await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(deleteMenu)] });
            }

            if (i.customId === 'sel_delete') {
                await Reminder.deleteOne({ id: i.values[0], userId: i.user.id });
                await i.update({ content: '✅ Напоминание удалено!', embeds: [], components: [] });
            }

            // --- РЕДАКТИРОВАНИЕ ---
            if (i.customId === 'btn_edit') {
                const editMenu = new StringSelectMenuBuilder().setCustomId('sel_edit').setPlaceholder('Выберите напоминание')
                    .addOptions(userReminders.slice(0, 25).map(r => ({ label: r.text.substring(0, 50), value: r.id, emoji: '✏️' })));

                await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(editMenu)] });
            }

            if (i.customId === 'sel_edit') {
                const remindId = i.values[0];
                const reminder = await Reminder.findOne({ id: remindId });

                const modal = new ModalBuilder().setCustomId(`modal_edit_${remindId}`).setTitle('Редактировать напоминание');

                const textInput = new TextInputBuilder().setCustomId('inp_text').setLabel('Новый текст').setStyle(TextInputStyle.Short).setValue(reminder.text).setRequired(true);
                const timeInput = new TextInputBuilder().setCustomId('inp_time').setLabel('Новое время (Unix Timestamp)').setStyle(TextInputStyle.Short).setValue(reminder.nextTime.toString()).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(textInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );

                await i.showModal(modal);

                try {
                    const modalInteraction = await i.awaitModalSubmit({ time: 60000, filter: m => m.customId === `modal_edit_${remindId}` });
                    
                    const newText = modalInteraction.fields.getTextInputValue('inp_text');
                    const newTime = parseInt(modalInteraction.fields.getTextInputValue('inp_time'));

                    const dbReminder = await Reminder.findOne({ id: remindId });
                    if (dbReminder) {
                        dbReminder.text = newText;
                        dbReminder.nextTime = newTime;
                        dbReminder.warned = false;
                        await dbReminder.save();

                        // Перезапускаем таймер
                        const remindCommand = require('./remind.js');
                        remindCommand.setReminderTimeout(dbReminder, interaction.client);
                        
                        await modalInteraction.reply({ content: '✅ Напоминание обновлено!', ephemeral: true });
                    }
                } catch (e) {
                    console.log('Пользователь закрыл окно.');
                }
            }
        });
    },
};
