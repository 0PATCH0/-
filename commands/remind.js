const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ComponentType 
} = require('discord.js');
const { Reminder } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('напомнить')
        .setDescription('Создать напоминание через интерактивное меню')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        
        // Храним состояние в памяти, пока пользователь кликает по кнопкам
        const state = {
            text: text,
            timezoneOffset: 3, // По умолчанию МСК
            repeat: 'once',
            targetId: null,
            targetType: null,
            nextTime: null
        };

        // Главное меню
        const embed = new EmbedBuilder()
            .setTitle('⏰ Настройка напоминания')
            .setColor('#d4af37')
            .setDescription(`**Текст:** ${text}\n\nВыберите параметры ниже, а затем нажмите «Далее».`)
            .addFields(
                { name: 'Часовой пояс', value: 'МСК (UTC+3)', inline: true },
                { name: 'Повтор', value: 'Один раз', inline: true },
                { name: 'Тег', value: 'Автор (вы)', inline: true }
            );

        const row1 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_tz')
                .setPlaceholder('Выберите часовой пояс')
                .addOptions([
                    { label: 'МСК (UTC+3)', value: '3', default: true },
                    { label: 'UTC (UTC+0)', value: '0' },
                    { label: 'UTC+2', value: '2' },
                    { label: 'UTC+4', value: '4' },
                    { label: 'UTC+5', value: '5' },
                    { label: 'UTC+7', value: '7' }
                ])
        );

        const row2 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_repeat')
                .setPlaceholder('Выберите повтор')
                .addOptions([
                    { label: 'Один раз', value: 'once', default: true },
                    { label: 'Каждый день', value: 'daily' },
                    { label: 'Каждую неделю', value: 'weekly' },
                    { label: 'Каждый месяц', value: 'monthly' }
                ])
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('next_step')
                .setLabel('Далее ➡️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Отмена')
                .setStyle(ButtonStyle.Danger)
        );

        const response = await interaction.reply({
            embeds: [embed],
            components: [row1, row2, row3],
            ephemeral: true,
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Это меню не для вас.', ephemeral: true });
            }

            if (i.customId === 'cancel') {
                collector.stop();
                return i.update({ content: '❌ Создание напоминания отменено.', embeds: [], components: [] });
            }

            if (i.customId === 'select_tz') {
                state.timezoneOffset = Number(i.values[0]);
                embed.spliceFields(0, 1, { name: 'Часовой пояс', value: i.component.options.find(o => o.value === i.values[0]).label, inline: true });
                await i.update({ embeds: [embed] });
            }

            if (i.customId === 'select_repeat') {
                state.repeat = i.values[0];
                embed.spliceFields(1, 1, { name: 'Повтор', value: i.component.options.find(o => o.value === i.values[0]).label, inline: true });
                await i.update({ embeds: [embed] });
            }

            if (i.customId === 'next_step') {
                collector.stop();
                await i.update({ content: '⏳ Загрузка следующего шага...', embeds: [], components: [] });
                await showTimeSelection(i, state);
            }
        });
    }
};

// Второй шаг: выбор времени
async function showTimeSelection(interaction, state) {
    const isRecurring = state.repeat !== 'once';
    
    const embed = new EmbedBuilder()
        .setTitle('🕒 Выбор времени')
        .setColor('#d4af37')
        .setDescription(`**Повтор:** ${state.repeat === 'once' ? 'Один раз' : state.repeat}`);

    const rows = [];

    // Если это разовое или ежедневное — можно выбрать «через N минут»
    if (!isRecurring) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('time_5m').setLabel('Через 5 мин').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('time_30m').setLabel('Через 30 мин').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('time_1h').setLabel('Через 1 час').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('time_custom').setLabel('Указать время').setStyle(ButtonStyle.Primary)
        );
        rows.push(row);
    } else {
        // Для повторяющихся — только выбор конкретного времени
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('time_custom').setLabel('Указать время').setStyle(ButtonStyle.Primary)
        );
        rows.push(row);
    }

    const msg = await interaction.editReply({ embeds: [embed], components: rows, content: null });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: 'Не для вас.', ephemeral: true });

        let targetTime = null;
        let targetDate = new Date();

        if (i.customId === 'time_5m') targetTime = Date.now() + 5 * 60000;
        if (i.customId === 'time_30m') targetTime = Date.now() + 30 * 60000;
        if (i.customId === 'time_1h') targetTime = Date.now() + 60 * 60000;

        if (i.customId === 'time_custom') {
            collector.stop();
            return await showCustomTimePicker(i, state);
        }

        if (targetTime) {
            collector.stop();
            state.nextTime = targetTime;
            await saveAndFinish(i, state);
        }
    });
}

// Третий шаг: ввод точного времени (для повторяющихся или кастомных)
async function showCustomTimePicker(interaction, state) {
    const embed = new EmbedBuilder()
        .setTitle('⌨️ Введите время')
        .setColor('#d4af37')
        .setDescription('Отправьте сообщение в формате **ЧЧ:ММ** (например, `20:30`).\n\nЕсли вы выбрали еженедельный повтор, укажите и день: `Пн 20:30`, `Сб 15:00` и т.д.');

    await interaction.editReply({ embeds: [embed], components: [] });

    const filter = m => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);

    if (!collected || collected.size === 0) {
        return interaction.editReply({ content: '⏳ Время вышло. Напоминание не создано.', embeds: [] });
    }

    const msg = collected.first();
    const input = msg.content.trim();
    await msg.delete().catch(() => {});

    // Парсим время
    let hour, minute, dayOfWeek = null;
    
    // Поддержка ввода "Пн 20:30" для еженедельных
    const daysMap = { 'вс': 0, 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6 };
    let timeStr = input;
    
    if (state.repeat === 'weekly') {
        const parts = input.split(' ');
        if (parts.length === 2) {
            const dayName = parts[0].toLowerCase().slice(0, 2);
            if (daysMap[dayName] !== undefined) {
                dayOfWeek = daysMap[dayName];
                timeStr = parts[1];
            }
        }
        if (dayOfWeek === null) {
            return interaction.editReply({ content: '❌ Неверный формат дня. Напишите, например: `Пн 20:30`', embeds: [] });
        }
    }

    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return interaction.editReply({ content: '❌ Неверный формат времени. Напишите, например: `20:30`', embeds: [] });
    }

    hour = Number(match[1]);
    minute = Number(match[2]);

    // Вычисляем дату
    const now = new Date();
    // Переводим в UTC с учетом часового пояса
    let targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour - state.timezoneOffset, minute, 0, 0));

    if (state.repeat === 'once') {
        // Если время уже прошло — переносим на завтра
        if (targetDate.getTime() <= Date.now()) {
            targetDate.setUTCDate(targetDate.getUTCDate() + 1);
        }
    } else if (state.repeat === 'daily') {
        // Каждый день: если время прошло, переносим на завтра
        if (targetDate.getTime() <= Date.now()) {
            targetDate.setUTCDate(targetDate.getUTCDate() + 1);
        }
    } else if (state.repeat === 'weekly') {
        // Каждую неделю: двигаем на нужный день
        const currentDay = targetDate.getUTCDay();
        let diff = dayOfWeek - currentDay;
        if (diff < 0) diff += 7;
        if (diff === 0 && targetDate.getTime() <= Date.now()) diff = 7;
        targetDate.setUTCDate(targetDate.getUTCDate() + diff);
    } else if (state.repeat === 'monthly') {
        if (targetDate.getTime() <= Date.now()) {
            targetDate.setUTCMonth(targetDate.getUTCMonth() + 1);
        }
    }

    state.nextTime = targetDate.getTime();
    state.hour = hour;
    state.minute = minute;
    state.dayOfWeek = dayOfWeek;

    await saveAndFinish(interaction, state);
}

// Финальный шаг: сохранение в БД
async function saveAndFinish(interaction, state) {
    const targetId = interaction.user.id;
    const targetType = 'user';

    try {
        const newReminder = await Reminder.create({
            id: Date.now().toString(),
            userId: interaction.user.id,
            channelId: interaction.channelId,
            text: state.text,
            targetId: targetId,
            targetType: targetType,
            repeat: state.repeat,
            nextTime: state.nextTime,
            hour: state.hour,
            minute: state.minute,
            timezone: state.timezoneOffset,
            warned: false
        });

        setReminderTimeout(newReminder, interaction.client);

        const dateStr = new Date(state.nextTime).toLocaleString('ru-RU', { 
            timeZone: `Etc/GMT${state.timezoneOffset >= 0 ? '-' : '+'}${Math.abs(state.timezoneOffset)}`,
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });

        const embed = new EmbedBuilder()
            .setTitle('✅ Напоминание создано!')
            .setColor('#2ecc71')
            .addFields(
                { name: '📝 Текст', value: state.text },
                { name: '🕒 Когда', value: dateStr },
                { name: '🔁 Повтор', value: state.repeat === 'once' ? 'Один раз' : 
                    state.repeat === 'daily' ? 'Каждый день' : 
                    state.repeat === 'weekly' ? 'Каждую неделю' : 'Каждый месяц' }
            )
            .setFooter({ text: `ID: ${newReminder.id}` });

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: null, embeds: [embed], components: [] });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (e) {
        console.error('SAVE REMINDER:', e);
        await interaction.editReply({ content: '❌ Ошибка сохранения.', embeds: [] });
    }
}

// Функция таймера
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
                    // Пересчитываем следующее время
                    let next = new Date(dbReminder.nextTime);
                    if (dbReminder.repeat === 'daily') {
                        next.setUTCDate(next.getUTCDate() + 1);
                    } else if (dbReminder.repeat === 'weekly') {
                        next.setUTCDate(next.getUTCDate() + 7);
                    } else if (dbReminder.repeat === 'monthly') {
                        next.setUTCMonth(next.getUTCMonth() + 1);
                    }
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
