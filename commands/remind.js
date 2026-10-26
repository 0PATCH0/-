const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../reminders.json');

// Загрузка базы данных напоминаний
function loadReminders() {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]');
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// Сохранение базы данных
function saveReminders(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('напомнить')
        .setDescription('Создать напоминание с повтором')
        .addStringOption(option => option.setName('текст').setDescription('О чём напомнить?').setRequired(true))
        .addIntegerOption(option => option.setName('через_минут').setDescription('Через сколько минут начать напоминать?').setRequired(true))
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
        const repeat = interaction.options.getString('повтор') || 'once';
        const target = interaction.options.getMentionable('кого_тегнуть') || interaction.user;

        // ID канала, где создано напоминание (чтобы бот знал, куда писать)
        const channelId = interaction.channelId;

        const remindId = Date.now().toString();
        const nextTime = Date.now() + (delayMin * 60 * 1000);

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

        // Сохраняем в файл
        const reminders = loadReminders();
        reminders.push(newReminder);
        saveReminders(reminders);

        // Ставим таймер на текущий запуск
        setReminderTimeout(newReminder, interaction.client);

        // Форматируем красивое сообщение об успехе
        let repeatText = repeat === 'once' ? 'Один раз' : (repeat === 'daily' ? 'Каждый день' : 'Каждую неделю');
        let targetText = target.user ? `<@${target.id}>` : `<@&${target.id}>`;

        const embed = new EmbedBuilder()
            .setTitle('⏰ Напоминание создано!')
            .setColor('#57F287')
            .addFields(
                { name: 'Текст', value: text },
                { name: 'Когда', value: `Через ${delayMin} мин.` },
                { name: 'Повтор', value: repeatText },
                { name: 'Кого тегнуть', value: targetText }
            )
            .setFooter({ text: `ID напоминания: ${remindId} (сохрани его, чтобы удалить)` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

// --- ФУНКЦИЯ ЗАПУСКА ТАЙМЕРА (ВЫНЕСЕНА ОТДЕЛЬНО) ---
// Она нужна, чтобы бот мог запускать ее как при создании команды, так и при перезапуске
function setReminderTimeout(reminder, client) {
    const timeLeft = reminder.nextTime - Date.now();

    // Если время уже прошло (например, бот лежал), запускаем через 5 секунд
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

            // Обработка повторов
            const reminders = loadReminders();
            const index = reminders.findIndex(r => r.id === reminder.id);

            if (index !== -1) {
                if (reminder.repeat === 'once') {
                    // Удаляем, если это был один раз
                    reminders.splice(index, 1);
                    saveReminders(reminders);
                } else {
                    // Обновляем время для следующего раза
                    let nextDelay = reminder.repeat === 'daily' ? 86400000 : 604800000;
                    reminders[index].nextTime = Date.now() + nextDelay;
                    saveReminders(reminders);
                    
                    // Запускаем таймер заново
                    setReminderTimeout(reminders[index], client);
                }
            }
        } catch (e) {
            console.error('Ошибка при отправке напоминания:', e);
        }
    }, timeout);
}

// ЭКСПОРТИРУЕМ ФУНКЦИЮ, ЧТОБЫ index.js МОГ ВОССТАНОВИТЬ ТАЙМЕРЫ ПРИ ЗАПУСКЕ
module.exports.setReminderTimeout = setReminderTimeout;
