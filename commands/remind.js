const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Reminder } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('напомнить')
        .setDescription('Создать напоминание')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true))
        .addIntegerOption(option => option.setName('часовой_пояс').setDescription('Смещение от UTC (например: 3)').setRequired(false))
        .addIntegerOption(option => option.setName('час').setDescription('Во сколько часов?').setRequired(false))
        .addIntegerOption(option => option.setName('минута').setDescription('Минута').setRequired(false))
        .addIntegerOption(option => option.setName('через_минут').setDescription('Или через сколько минут?').setRequired(false))
        .addStringOption(option => option.setName('повтор').setDescription('Как часто?').setRequired(false)
            .addChoices(
                { name: 'Один раз', value: 'once' }, 
                { name: 'Каждый день', value: 'daily' },
                { name: 'Каждую неделю', value: 'weekly' },
                { name: 'Каждый месяц', value: 'monthly' }
            ))
        .addIntegerOption(option => option.setName('день_недели').setDescription('Для еженедельного (1-Пн, 7-Вс)').setRequired(false)
            .setMinValue(1).setMaxValue(7))
        .addMentionableOption(option => option.setName('кого_тегнуть').setDescription('Кого тегнуть?').setRequired(false)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const timezoneOffset = interaction.options.getInteger('часовой_пояс') ?? 0;
        const delayMin = interaction.options.getInteger('через_минут');
        const hour = interaction.options.getInteger('час');
        const minute = interaction.options.getInteger('минута') || 0;
        const repeat = interaction.options.getString('повтор') || 'once';
        const dayOfWeek = interaction.options.getInteger('день_недели'); // 1-7
        const target = interaction.options.getMentionable('кого_тегнуть') || interaction.user;

        // Проверка на корректность повторения
        if (repeat === 'weekly' && !dayOfWeek) {
            return interaction.reply({ content: '❌ Для еженедельного напоминания укажи `день_недели` (1-Пн, 7-Вс).', ephemeral: true });
        }

        let nextTime = Date.now();

        if (delayMin !== null) {
            nextTime += (delayMin * 60 * 1000);
        } else if (hour !== null) {
            const targetDate = new Date();
            // Устанавливаем время в UTC с учетом часового пояса
            targetDate.setUTCHours(hour - timezoneOffset, minute, 0, 0);

            if (repeat === 'weekly') {
                // dayOfWeek у нас 1-7, а getUTCDay() возвращает 0-6
                const jsDay = dayOfWeek === 7 ? 0 : dayOfWeek;
                const currentDay = targetDate.getUTCDay();
                let diff = jsDay - currentDay;
                if (diff < 0) diff += 7;
                if (diff === 0 && targetDate.getTime() <= Date.now()) diff = 7;
                targetDate.setUTCDate(targetDate.getUTCDate() + diff);
            } else if (repeat === 'monthly') {
                if (targetDate.getTime() <= Date.now()) {
                    targetDate.setUTCMonth(targetDate.getUTCMonth() + 1);
                }
            } else {
                // Для once и daily
                if (targetDate.getTime() <= Date.now()) {
                    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
                }
            }
            nextTime = targetDate.getTime();
        } else {
            return interaction.reply({ content: 'Укажи время.', ephemeral: true });
        }

        // СОХРАНЯЕМ В БАЗУ ДАННЫХ
        const newReminder = await Reminder.create({
            id: Date.now().toString(),
            userId: interaction.user.id,
            channelId: interaction.channelId,
            text: text,
            targetId: target.id,
            targetType: target.user ? 'user' : 'role',
            repeat: repeat,
            nextTime: nextTime,
            hour: hour,
            minute: minute,
            timezone: timezoneOffset,
            dayOfWeek: dayOfWeek || null,
            warned: false
        });

        setReminderTimeout(newReminder, interaction.client);

        const embed = new EmbedBuilder().setTitle('⏰ Напоминание создано!').setColor('#57F287')
            .addFields(
                { name: 'Текст', value: text }, 
                { name: 'Когда', value: `<t:${Math.floor(nextTime / 1000)}:f>` },
                { name: 'Повтор', value: repeat === 'once' ? 'Один раз' : 
                    repeat === 'daily' ? 'Каждый день' : 
                    repeat === 'weekly' ? 'Каждую неделю' : 'Каждый месяц' }
            )
            .setFooter({ text: `ID: ${newReminder.id}` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

// Функция для таймера (работает с объектом из БД)
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

            // Обновляем или удаляем в БД
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
