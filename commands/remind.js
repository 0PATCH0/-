const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../reminders.json');

function loadReminders() {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]');
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveReminders(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('напомнить')
        .setDescription('Создать напоминание (с учетом часового пояса)')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true))
        .addIntegerOption(option => option.setName('часовой_пояс').setDescription('Смещение от UTC (например: 3)').setRequired(false).setMinValue(-12).setMaxValue(14))
        
        .addIntegerOption(option => option.setName('час').setDescription('Во сколько часов?').setRequired(false).setMinValue(0).setMaxValue(23))
        .addIntegerOption(option => option.setName('минута').setDescription('В какую минуту?').setRequired(false).setMinValue(0).setMaxValue(59))
        .addIntegerOption(option => option.setName('через_минут').setDescription('Или через сколько минут?').setRequired(false))
        
        .addStringOption(option => option.setName('день_недели').setDescription('День недели').setRequired(false)
            .addChoices(
                { name: 'Понедельник', value: '1' }, { name: 'Вторник', value: '2' }, { name: 'Среда', value: '3' },
                { name: 'Четверг', value: '4' }, { name: 'Пятница', value: '5' }, { name: 'Суббота', value: '6' }, { name: 'Воскресенье', value: '0' }
            ))
        .addStringOption(option => option.setName('дата').setDescription('Конкретная дата (ДД.ММ.ГГГГ)').setRequired(false))
        
        .addStringOption(option => option.setName('повтор').setDescription('Как часто повторять?').setRequired(false)
            .addChoices(
                { name: 'Один раз', value: 'once' },
                { name: 'Каждый день', value: 'daily' },
                { name: 'Каждую неделю', value: 'weekly' }
            ))
        .addMentionableOption(option => option.setName('кого_тегнуть').setDescription('Тегнуть себя или роль').setRequired(false)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const timezoneOffset = interaction.options.getInteger('часовой_пояс') ?? 0;
        const delayMin = interaction.options.getInteger('через_минут');
        const hour = interaction.options.getInteger('час');
        const minute = interaction.options.getInteger('минута') || 0;
        const dayOfWeek = interaction.options.getString('день_недели');
        const dateInput = interaction.options.getString('дата');
        const repeat = interaction.options.getString('повтор') || 'once';
        const target = interaction.options.getMentionable('кого_тегнуть') || interaction.user;

        let nextTime = 0;
        let timeDescription = '';

        let inputsCount = 0;
        if (delayMin !== null) inputsCount++;
        if (hour !== null) inputsCount++;
        if (dayOfWeek !== null) inputsCount++;
        if (dateInput !== null) inputsCount++;

        if (inputsCount > 1) {
            return interaction.reply({ content: 'Ошибка: Выбери **что-то одно** для времени.', ephemeral: true });
        }

        const now = new Date();

        if (delayMin !== null) {
            nextTime = Date.now() + (delayMin * 60 * 1000);
            timeDescription = `Через ${delayMin} мин.`;
        } 
        else if (dateInput !== null) {
            const parts = dateInput.split('.');
            if (parts.length !== 3) return interaction.reply({ content: 'Ошибка: Формат даты **ДД.ММ.ГГГГ**.', ephemeral: true });
            const targetDate = new Date(Date.UTC(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), (hour || 0) - timezoneOffset, minute));
            if (isNaN(targetDate.getTime()) || targetDate.getTime() <= now.getTime()) return interaction.reply({ content: 'Ошибка: Неверная или прошедшая дата.', ephemeral: true });
            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f>`;
        }
        else if (dayOfWeek !== null) {
            const targetDate = new Date();
            targetDate.setUTCHours((hour || 0) - timezoneOffset, minute, 0, 0);
            let daysToAdd = parseInt(dayOfWeek) - targetDate.getUTCDay();
            if (daysToAdd < 0) daysToAdd += 7;
            if (daysToAdd === 0 && targetDate.getTime() <= now.getTime()) daysToAdd = 7;
            targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f>`;
        }
        else if (hour !== null) {
            const targetDate = new Date();
            targetDate.setUTCHours(hour - timezoneOffset, minute, 0, 0);
            if (targetDate.getTime() <= now.getTime()) targetDate.setUTCDate(targetDate.getUTCDate() + 1);
            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:t> (<t:${Math.floor(nextTime / 1000)}:R>)`;
        } 
        else {
            return interaction.reply({ content: 'Ошибка: Укажи время.', ephemeral: true });
        }

        const remindId = Date.now().toString();

        // СОХРАНЯЕМ ВСЕ ДАННЫЕ ДЛЯ РЕДАКТИРОВАНИЯ И ЖЕСТКОЙ ПРИВЯЗКИ
        const newReminder = {
            id: remindId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            text: text,
            targetId: target.id,
            targetType: target.user ? 'user' : 'role',
            repeat: repeat,
            nextTime: nextTime,
            // Данные для точного пересчета при повторе:
            hour: hour !== null ? hour : null,
            minute: minute,
            timezone: timezoneOffset,
            warned: false // Флаг, чтобы предупредить за 5 минут только один раз
        };

        const reminders = loadReminders();
        reminders.push(newReminder);
        saveReminders(reminders);

        setReminderTimeout(newReminder, interaction.client);

        const embed = new EmbedBuilder()
            .setTitle('⏰ Напоминание создано!')
            .setColor('#57F287')
            .addFields(
                { name: 'Текст', value: text },
                { name: 'Когда', value: timeDescription },
                { name: 'Повтор', value: repeat === 'once' ? 'Один раз' : (repeat === 'daily' ? 'Каждый день' : 'Каждую неделю') }
            )
            .setFooter({ text: `ID: ${remindId} • Управление: /мои_напоминания` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

function setReminderTimeout(reminder, client) {
    const timeLeft = reminder.nextTime - Date.now();
    const timeout = timeLeft > 0 ? timeLeft : 5000;

    // Таймер на 5 минут до события
    if (timeLeft > 5 * 60 * 1000 && !reminder.warned) {
        setTimeout(async () => {
            try {
                const channel = await client.channels.fetch(reminder.channelId);
                if (channel) {
                    let ping = reminder.targetType === 'user' ? `<@${reminder.targetId}>` : `<@&${reminder.targetId}>`;
                    await channel.send({ content: `🔔 **Скоро начнется!** (через 5 минут)\n${ping}, напоминаю: **${reminder.text}**` });
                    
                    // Отмечаем, что предупредили
                    const reminders = loadReminders();
                    const idx = reminders.findIndex(r => r.id === reminder.id);
                    if (idx !== -1) {
                        reminders[idx].warned = true;
                        saveReminders(reminders);
                    }
                }
            } catch (e) { console.error(e); }
        }, timeLeft - 5 * 60 * 1000);
    }

    // Основной таймер
    setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(reminder.channelId);
            if (channel) {
                let ping = reminder.targetType === 'user' ? `<@${reminder.targetId}>` : `<@&${reminder.targetId}>`;
                await channel.send({ content: `🔔 **Напоминание!**\n${ping}, **${reminder.text}**` });
            }

            const reminders = loadReminders();
            const index = reminders.findIndex(r => r.id === reminder.id);

            if (index !== -1) {
                if (reminder.repeat === 'once') {
                    reminders.splice(index, 1); // Удаляем, если разовое
                } else {
                    // ЖЕСТКАЯ ПРИВЯЗКА ВРЕМЕНИ
                    let nextTimestamp = reminder.nextTime;
                    if (reminder.repeat === 'daily') nextTimestamp += 86400000; // +24 часа
                    if (reminder.repeat === 'weekly') nextTimestamp += 604800000; // +7 дней
                    
                    reminders[index].nextTime = nextTimestamp;
                    reminders[index].warned = false; // Сбрасываем флаг предупреждения
                    setReminderTimeout(reminders[index], client); // Запускаем следующий цикл
                }
                saveReminders(reminders);
            }
        } catch (e) { console.error(e); }
    }, timeout);
}

module.exports.setReminderTimeout = setReminderTimeout;
