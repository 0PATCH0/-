const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const { Reminder } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('напомнить')
        .setDescription('Создать напоминание через интерактивное меню')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const state = {
            text: interaction.options.getString('текст'),
            timezoneOffset: 3,
            repeat: 'once',
            dayOfWeek: null,
            hour: 20,
            minute: 0
        };

        await showMainMenu(interaction, state);
    }
};

// === ГЛАВНОЕ МЕНЮ ===
async function showMainMenu(interaction, state) {
    const embed = new EmbedBuilder()
        .setTitle('⏰ Настройка напоминания')
        .setColor('#d4af37')
        .setDescription(`**Текст:** ${state.text}\n\nВыберите параметры ниже, а затем нажмите «Далее».`)
        .addFields(
            { name: 'Часовой пояс', value: `UTC+${state.timezoneOffset}`, inline: true },
            { name: 'Повтор', value: getRepeatName(state.repeat), inline: true }
        );

    const row1 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_tz')
            .setPlaceholder('Выберите часовой пояс')
            .addOptions([
                { label: 'МСК (UTC+3)', value: '3', default: state.timezoneOffset === 3 },
                { label: 'UTC (UTC+0)', value: '0', default: state.timezoneOffset === 0 },
                { label: 'UTC+2', value: '2', default: state.timezoneOffset === 2 },
                { label: 'UTC+4', value: '4', default: state.timezoneOffset === 4 },
                { label: 'UTC+5', value: '5', default: state.timezoneOffset === 5 }
            ])
    );

    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_repeat')
            .setPlaceholder('Выберите повтор')
            .addOptions([
                { label: 'Один раз', value: 'once', default: state.repeat === 'once' },
                { label: 'Каждый день', value: 'daily', default: state.repeat === 'daily' },
                { label: 'Каждую неделю', value: 'weekly', default: state.repeat === 'weekly' },
                { label: 'Каждый месяц', value: 'monthly', default: state.repeat === 'monthly' }
            ])
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('next_step').setLabel('Далее ➡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cancel').setLabel('Отмена').setStyle(ButtonStyle.Danger)
    );

    let msg;
    // Проверяем: если это первичный вызов (из execute) или обновление
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        msg = await interaction.update({ embeds: [embed], components: [row1, row2, row3], fetchReply: true });
    } else {
        msg = await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
    }

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: 'Не для вас.', flags: MessageFlags.Ephemeral });

        if (i.customId === 'cancel') {
            collector.stop();
            return i.update({ content: '❌ Отменено.', embeds: [], components: [] });
        }

        if (i.customId === 'select_tz') {
            state.timezoneOffset = Number(i.values[0]);
            collector.stop(); // Останавливаем старый, чтобы не было конфликтов
            return showMainMenu(i, state); // Рекурсивно перерисовываем с новым state
        }

        if (i.customId === 'select_repeat') {
            state.repeat = i.values[0];
            collector.stop();
            return showMainMenu(i, state);
        }

        if (i.customId === 'next_step') {
            collector.stop();
            await i.deferUpdate();
            try {
                await showTimeMenu(i, state);
            } catch (err) {
                console.error('ОШИБКА В showTimeMenu:', err);
                await i.editReply({ content: '⚠️ Ошибка при открытии меню времени.', embeds: [], components: [] });
            }
        }
    });
}

// === МЕНЮ ВЫБОРА ВРЕМЕНИ (ЧАСЫ И МИНУТЫ) ===
async function showTimeMenu(interaction, state) {
    const isWeekly = state.repeat === 'weekly';

    const embed = new EmbedBuilder()
        .setTitle('🕒 Выбор времени')
        .setColor('#d4af37')
        .setDescription(`**Повтор:** ${getRepeatName(state.repeat)}\nВыберите час и минуту, затем нажмите «Сохранить».`);

    const rows = [];

    if (isWeekly) {
        const dayRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_day')
                .setPlaceholder('Выберите день недели')
                .addOptions([
                    { label: 'Понедельник', value: '1' },
                    { label: 'Вторник', value: '2' },
                    { label: 'Среда', value: '3' },
                    { label: 'Четверг', value: '4' },
                    { label: 'Пятница', value: '5' },
                    { label: 'Суббота', value: '6' },
                    { label: 'Воскресенье', value: '0' }
                ])
        );
        rows.push(dayRow);
    }

    const hourOptions = [];
    for (let h = 0; h < 24; h++) {
        hourOptions.push({ label: `${h.toString().padStart(2, '0')}:00`, value: h.toString() });
    }
    
    const hourRow1 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_hour')
            .setPlaceholder('Выберите час (0-11)')
            .addOptions(hourOptions.slice(0, 12))
    );
    const hourRow2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_hour_2')
            .setPlaceholder('Выберите час (12-23)')
            .addOptions(hourOptions.slice(12, 24))
    );
    rows.push(hourRow1, hourRow2);

    const minuteRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_minute')
            .setPlaceholder('Выберите минуту')
            .addOptions([
                { label: ':00', value: '0' },
                { label: ':05', value: '5' },
                { label: ':10', value: '10' },
                { label: ':15', value: '15' },
                { label: ':20', value: '20' },
                { label: ':25', value: '25' },
                { label: ':30', value: '30' },
                { label: ':35', value: '35' },
                { label: ':40', value: '40' },
                { label: ':45', value: '45' },
                { label: ':50', value: '50' },
                { label: ':55', value: '55' }
            ])
    );
    rows.push(minuteRow);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('save_reminder').setLabel('✅ Сохранить').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('back_to_main').setLabel('⬅️ Назад').setStyle(ButtonStyle.Secondary)
    );
    rows.push(btnRow);

    const finalRows = rows.slice(0, 5);

    const msg = await interaction.editReply({ embeds: [embed], components: finalRows });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: 'Не для вас.', flags: MessageFlags.Ephemeral });

        if (i.customId === 'back_to_main') {
            collector.stop();
            return showMainMenu(i, state);
        }

        if (i.customId === 'select_day') {
            state.dayOfWeek = Number(i.values[0]);
            return i.reply({ content: `День недели выбран: ${getDayName(state.dayOfWeek)}`, flags: MessageFlags.Ephemeral });
        }

        if (i.customId === 'select_hour' || i.customId === 'select_hour_2') {
            state.hour = Number(i.values[0]);
            return i.reply({ content: `Час выбран: ${state.hour}:00`, flags: MessageFlags.Ephemeral });
        }

        if (i.customId === 'select_minute') {
            state.minute = Number(i.values[0]);
            return i.reply({ content: `Минута выбрана: :${state.minute.toString().padStart(2, '0')}`, flags: MessageFlags.Ephemeral });
        }

        if (i.customId === 'save_reminder') {
            if (isWeekly && state.dayOfWeek === null) {
                return i.reply({ content: '⚠️ Вы не выбрали день недели!', flags: MessageFlags.Ephemeral });
            }
            collector.stop();
            await i.deferUpdate();
            await saveReminder(i, state);
        }
    });
}

// === СОХРАНЕНИЕ В БАЗУ ===
async function saveReminder(interaction, state) {
    const now = new Date();
    
    let targetDate = new Date(Date.UTC(
        now.getUTCFullYear(), 
        now.getUTCMonth(), 
        now.getUTCDate(), 
        state.hour - state.timezoneOffset, 
        state.minute, 0, 0
    ));

    if (state.repeat === 'once' || state.repeat === 'daily' || state.repeat === 'monthly') {
        if (targetDate.getTime() <= Date.now()) {
            if (state.repeat === 'once' || state.repeat === 'daily') {
                targetDate.setUTCDate(targetDate.getUTCDate() + 1);
            } else if (state.repeat === 'monthly') {
                targetDate.setUTCMonth(targetDate.getUTCMonth() + 1);
            }
        }
    } else if (state.repeat === 'weekly') {
        const currentDay = targetDate.getUTCDay();
        let diff = state.dayOfWeek - currentDay;
        if (diff < 0) diff += 7;
        if (diff === 0 && targetDate.getTime() <= Date.now()) diff = 7;
        targetDate.setUTCDate(targetDate.getUTCDate() + diff);
    }

    try {
        const newReminder = await Reminder.create({
            id: Date.now().toString(),
            userId: interaction.user.id,
            channelId: interaction.channelId,
            text: state.text,
            targetId: interaction.user.id,
            targetType: 'user',
            repeat: state.repeat,
            nextTime: targetDate.getTime(),
            hour: state.hour,
            minute: state.minute,
            timezone: state.timezoneOffset,
            warned: false
        });

        setReminderTimeout(newReminder, interaction.client);

        const dateStr = targetDate.toLocaleString('ru-RU', { 
            timeZone: `Etc/GMT${state.timezoneOffset >= 0 ? '-' : '+'}${Math.abs(state.timezoneOffset)}`,
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });

        const embed = new EmbedBuilder()
            .setTitle('✅ Напоминание создано!')
            .setColor('#2ecc71')
            .addFields(
                { name: '📝 Текст', value: state.text },
                { name: '🕒 Когда', value: dateStr },
                { name: '🔁 Повтор', value: getRepeatName(state.repeat) }
            )
            .setFooter({ text: `ID: ${newReminder.id}` });

        await interaction.editReply({ content: null, embeds: [embed], components: [] });
    } catch (e) {
        console.error('SAVE REMINDER:', e);
        await interaction.editReply({ content: '❌ Ошибка сохранения.', embeds: [], components: [] });
    }
}

// === УТИЛИТЫ ===
function getRepeatName(repeat) {
    if (repeat === 'once') return 'Один раз';
    if (repeat === 'daily') return 'Каждый день';
    if (repeat === 'weekly') return 'Каждую неделю';
    if (repeat === 'monthly') return 'Каждый месяц';
    return repeat;
}

function getDayName(day) {
    const names = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return names[day];
}

// === ТАЙМЕР ===
function setReminderTimeout(reminder, client) {
    const timeLeft = reminder.nextTime - Date.now();
    const timeout = timeLeft > 0 ? timeLeft : 5000;

    setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
            if (channel) {
                let ping = reminder.targetType === 'user' ? `<@${reminder.targetId}>` : `<@&${reminder.targetId}>`;
                await channel.send({ content: `🔔 **Напоминание!**\n${ping}, **${reminder.text}**` });
            }

            const dbReminder = await Reminder.findOne({ id: reminder.id });
            if (dbReminder) {
                if (dbReminder.repeat === 'once') {
                    await Reminder.deleteOne({ id: dbReminder.id });
                } else {
                    let next = new Date(dbReminder.nextTime);
                    if (dbReminder.repeat === 'daily') next.setUTCDate(next.getUTCDate() + 1);
                    else if (dbReminder.repeat === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
                    else if (dbReminder.repeat === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
                    
                    dbReminder.nextTime = next.getTime();
                    dbReminder.warned = false;
                    await dbReminder.save();
                    setReminderTimeout(dbReminder, client);
                }
            }
        } catch (e) { console.error(e); }
    }, timeout);
}

module.exports.setReminderTimeout = setReminderTimeout;
