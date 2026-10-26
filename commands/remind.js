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
        .setDescription('Создать напоминание (время, день недели или дата)')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true))
        
        // Таймер в минутах
        .addIntegerOption(option => option.setName('через_минут').setDescription('Через сколько минут начать напоминать?').setRequired(false))
        
        // Точное время
        .addIntegerOption(option => option.setName('час').setDescription('Во сколько часов? (0-23)').setRequired(false).setMinValue(0).setMaxValue(23))
        .addIntegerOption(option => option.setName('минута').setDescription('В какую минуту? (0-59)').setRequired(false).setMinValue(0).setMaxValue(59))
        
        // День недели и дата
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
        .addStringOption(option => option.setName('дата').setDescription('Конкретная дата (формат: ДД.ММ.ГГГГ, например 25.12.2026)').setRequired(false))
        
        // Повторения
        .addStringOption(option => option.setName('повтор').setDescription('Как часто повторять?').setRequired(false)
            .addChoices(
                { name: 'Один раз', value: 'once' },
                { name: 'Каждый день', value: 'daily' },
                { name: 'Каждую неделю', value: 'weekly' }
            ))
        .addMentionableOption(option => option.setName('кого_тегнуть').setDescription('Тегнуть себя или роль (по умолчанию - себя)').setRequired(false)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const delayMin = interaction.options.getInteger('через_минут');
        const hour = interaction.options.getInteger('час');
        const minute = interaction.options.getInteger('минута') || 0;
        const dayOfWeek = interaction.options.getString('день_недели');
        const dateInput = interaction.options.getString('дата');
        const repeat = interaction.options.getString('повтор') || 'once';
        const target = interaction.options.getMentionable('кого_тегнуть') || interaction.user;

        let nextTime = 0;
        let timeDescription = '';

        // Проверка на дурака (если указали всё сразу)
        let inputsCount = 0;
        if (delayMin !== null) inputsCount++;
        if (hour !== null) inputsCount++;
        if (dayOfWeek !== null) inputsCount++;
        if (dateInput !== null) inputsCount++;

        if (inputsCount > 1) {
            return interaction.reply({ content: 'Ошибка: Выбери **что-то одно** для времени (либо `через_минут`, либо `час`, либо `день_недели`, либо `дата`).', ephemeral: true });
        }

        const now = new Date();

        // 1. Через N минут
        if (delayMin !== null) {
            nextTime = Date.now() + (delayMin * 60 * 1000);
            timeDescription = `Через ${delayMin} мин.`;
        } 
        // 2. Конкретная дата (ДД.ММ.ГГГГ)
        else if (dateInput !== null) {
            const parts = dateInput.split('.');
            if (parts.length !== 3) {
                return interaction.reply({ content: 'Ошибка: Дата должна быть в формате **ДД.ММ.ГГГГ** (например, 25.12.2026).', ephemeral: true });
            }
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // В JS месяцы с 0
            const year = parseInt(parts[2]);

            const targetDate = new Date(year, month, day, hour || 0, minute, 0, 0);
            
            if (isNaN(targetDate.getTime())) {
                return interaction.reply({ content: 'Ошибка: Неверная дата.', ephemeral: true });
            }
            if (targetDate.getTime() <= now.getTime()) {
                return interaction.reply({ content: 'Ошибка: Эта дата уже прошла.', ephemeral: true });
            }

            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f>`;
        }
        // 3. День недели
        else if (dayOfWeek !== null) {
            const targetDay = parseInt(dayOfWeek);
            const targetDate = new Date();
            targetDate.setHours(hour || 0, minute, 0, 0);

            // Вычисляем, сколько дней прибавить до нужного дня
            let daysToAdd = targetDay - targetDate.getDay();
            if (daysToAdd < 0) daysToAdd += 7; // Если день прошел на этой неделе, берем следующую
            if (daysToAdd === 0 && targetDate.getTime() <= now.getTime()) daysToAdd = 7; // Если это сегодня, но время прошло

            targetDate.setDate(targetDate.getDate() + daysToAdd);
            
            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:f>`;
        }
        // 4. Просто время (час и минута)
        else if (hour !== null) {
            const targetDate = new Date();
            targetDate.setHours(hour, minute, 0, 0);

            // Если время уже прошло сегодня, переносим на завтра
            if (targetDate.getTime() <= now.getTime()) {
                targetDate.setDate(targetDate.getDate() + 1);
            }

            nextTime = targetDate.getTime();
            timeDescription = `<t:${Math.floor(nextTime / 1000)}:t> (<t:${Math.floor(nextTime / 1000)}:R>)`;
        } 
        // Если ничего не указано
        else {
            return interaction.reply({ content: 'Ошибка: Укажи время (например, `час: 18`), день недели, дату или `через_минут`.', ephemeral: true });
        }

        const remindId = Date.now().toString();
        const channelId = interaction.channelId;

        const newReminder = {
            id: remindId,
            userId: interaction.user.id,
            channelId: channelId,
            text: text,
            targetId: target.id,
            targetType: target.user ? 'user' : 'role',
            repeat: repeat,
            nextTime: nextTime
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
                { name: 'Повтор', value: repeatText },
                { name: 'Кого тегнуть', value: targetText }
            )
            .setFooter({ text: `ID напоминания: ${remindId} (сохрани его, чтобы удалить)` });

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
                    reminders[index].nextTime = Date.now() + nextDelay;
                    saveReminders(reminders);
                    
                    setReminderTimeout(reminders[index], client);
                }
            }
        } catch (e) {
            console.error('Ошибка при отправке напоминания:', e);
        }
    }, timeout);
}

module.exports.setReminderTimeout = setReminderTimeout;
