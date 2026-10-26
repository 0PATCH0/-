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
        
        // Часовой пояс
        .addIntegerOption(option => option.setName('часовой_пояс').setDescription('Смещение от UTC (например: 3 для Москвы, 2 для Киева)').setRequired(false).setMinValue(-12).setMaxValue(14))
        
        // Время
        .addIntegerOption(option => option.setName('час').setDescription('Во сколько часов? (по вашему поясу)').setRequired(false).setMinValue(0).setMaxValue(23))
        .addIntegerOption(option => option.setName('минута').setDescription('В какую минуту? (0-59)').setRequired(false).setMinValue(0).setMaxValue(59))
        .addIntegerOption(option => option.setName('через_минут').setDescription('Или через сколько минут начать?').setRequired(false))
        
        // Дни
        .addStringOption(option => option.setName('день_недели').setDescription('В какой день недели?').setRequired(false)
            .addChoices(
                { name: 'Понедельник', value: '1' },
                { name: 'Вторник', value: '2' },
                { name: 'Среда', value: '3' },
                { name: 'Четверг', value: '4' },
                { name: 'Пятница', value: '5' },
                { name: 'Суббота', value: '6' },
                { name: 'Воскресенье', value: '0' }
            ))
        .addStringOption(option => option.setName('дата').setDescription('Конкретная дата (ДД.ММ.ГГГГ)').setRequired(false))
        
        // Повторения
        .addStringOption(option => option.setName('повтор').setDescription('Как часто повторять?').setRequired(false)
            .addChoices(
                { name: 'Один раз', value: 'once' },
                { name: 'Каждый день', value: 'daily' },
                { name: 'Каждую неделю', value: 'weekly' }
            ))
        .addMentionableOption(option => option.setName('кого_тегнуть').setDescription('Тегнуть себя или роль').setRequired(false)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const timezoneOffset = interaction.options.getInteger('часовой_пояс') ?? 0; // По умолчанию UTC
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
            return interaction.reply({ content: 'Ошибка: Выбери **что-то одно** для времени (либо `через_минут`, либо `час`, либо `день_недели`, либо `дата`).', ephemeral: true });
        }

        const now = new Date();

        // 1. Таймер
        if (delayMin !== null) {
            nextTime = Date.now() + (delayMin * 60 * 1000);
            timeDescription = `Через ${delayMin} мин.`;
        } 
        // 2. Точная дата
        else if (dateInput !== null) {
            const parts = dateInput.split('.');
            if (parts.length !== 3) {
                return interaction.reply({ content: 'Ошибка: Дата должна быть в формате **ДД.ММ.ГГГГ**.', ephemeral: true });
            }
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);

            // Создаем дату в UTC и вычитаем часовой пояс
            const targetDate = new Date(Date.UTC(year, month, day, (hour || 0) - timezoneOffset, minute));
            
            if (isNaN(targetDate.getTime())) return interaction.reply({ content: 'Ошибка: Неверная дата.', ephemeral: true });
            if (targetDate.getTime() <= now.getTime()) return interaction.reply({ content: 'Ошибка: Эта дата уже прошла.', ephemeral: true });

            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f> (твой пояс) | <t:${Math.floor(nextTime / 1000)}:F>`;
        }
        // 3. День недели
        else if (dayOfWeek !== null) {
            const targetDay = parseInt(dayOfWeek);
            const targetDate = new Date();
            
            // Вычисляем разницу часов с UTC
            const utcHour = (hour || 0) - timezoneOffset;
            targetDate.setUTCHours(utcHour, minute, 0, 0);

            let daysToAdd = targetDay - targetDate.getUTCDay();
            if (daysToAdd < 0) daysToAdd += 7;
            if (daysToAdd === 0 && targetDate.getTime() <= now.getTime()) daysToAdd = 7;

            targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
            
            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f> (твой пояс) | <t:${Math.floor(nextTime / 1000)}:F>`;
        }
        // 4. Время (часы/минуты)
        else if (hour !== null) {
            const targetDate = new Date();
            const utcHour = hour - timezoneOffset;
            targetDate.setUTCHours(utcHour, minute, 0, 0);

            if (targetDate.getTime() <= now.getTime()) {
                targetDate.setUTCDate(targetDate.getUTCDate() + 1);
            }

            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:t> (<t:${Math.floor(nextTime / 1000)}:R>)`;
        } 
        else {
            return interaction.reply({ content: 'Ошибка: Укажи время, день недели, дату или `через_минут`.', ephemeral: true });
        }

        const remindId = Date.now().toString();
        const channelId = interaction.channelId;

        const newReminder = {
            id: remindId,
            userId: interaction.user.id, // Сохраняем ID создателя!
            channelId: channelId,
            text: text,
            targetId: target.id,
            targetType: target.user ? 'user' : 'role',
            repeat: repeat,
            nextTime: nextTime,
            timezone: timezoneOffset
        };

        const reminders = loadReminders();
        reminders.push(newReminder);
        saveReminders(reminders);

        setReminderTimeout(newReminder, interaction.client);

        let repeatText = repeat === 'once' ? 'Один раз' : (repeat === 'daily' ? 'Каждый день' : 'Каждую неделю');
        let targetText = target.user ? `<@${target.id}>` : `<@&${target.id}>`;

        const embed = new EmbedBuilder()
            .setTitle('⏰ Напоминание создано!')
            .setColor('#57F287')
            .addFields(
                { name: 'Текст', value: text },
                { name: 'Когда', value: timeDescription },
                { name: 'Часовой пояс', value: `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}` },
                { name: 'Повтор', value: repeatText },
                { name: 'Кого тегнуть', value: targetText }
            )
            .setFooter({ text: `ID: ${remindId} • Управление: /мои_напоминания` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

function setReminderTimeout(reminder, client) {
    const timeLeft = reminder.nextTime - Date.now();
    const timeout = timeLeft > 0 ? timeLeft : 5000;

    setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(reminder.channelId);
            if (channel) {
                let ping = reminder.targetType === 'user' ? `<@${reminder.targetId}>` : `<@&${reminder.targetId}>`;
                
                const embed = new EmbedBuilder()
                    .setTitle('🔔 Напоминание!')
                    .setDescription(`**${reminder.text}**`)
                    .setColor('#FEE75C')
                    .setFooter({ text: `Создано <@${reminder.userId}>` });

                await channel.send({ content: ping, embeds: [embed] });
            }

            const reminders = loadReminders();
            const index = reminders.findIndex(r => r.id === reminder.id);

            if (index !== -1) {
                if (reminder.repeat === 'once') {
                    reminders.splice(index, 1);
                    saveReminders(reminders);
                } else {
                    let nextDelay = reminder.repeat === 'daily' ? 86400000 : 604800000;
                    
                    // Если время "плывет", мы жестко пересчитываем на следующие сутки
                    reminders[index].nextTime = Date.now() + nextDelay;
                    saveReminders(reminders);
                    
                    setReminderTimeout(reminders[index], client);
                }
            }
        } catch (e) {
            console.error('Ошибка при отправке:', e);
        }
    }, timeout);
}

module.exports.setReminderTimeout = setReminderTimeout;
