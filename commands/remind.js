const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Reminder } = require('../models'); // Подключаем модель БД

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
            .addChoices({ name: 'Один раз', value: 'once' }, { name: 'Каждый день', value: 'daily' }))
        .addMentionableOption(option => option.setName('кого_тегнуть').setDescription('Кого тегнуть?').setRequired(false)),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const timezoneOffset = interaction.options.getInteger('часовой_пояс') ?? 0;
        const delayMin = interaction.options.getInteger('через_минут');
        const hour = interaction.options.getInteger('час');
        const minute = interaction.options.getInteger('минута') || 0;
        const repeat = interaction.options.getString('повтор') || 'once';
        const target = interaction.options.getMentionable('кого_тегнуть') || interaction.user;

        let nextTime = Date.now(); // Если delayMin, то прибавим ниже
        if (delayMin !== null) {
            nextTime += (delayMin * 60 * 1000);
        } else if (hour !== null) {
            const targetDate = new Date();
            targetDate.setUTCHours(hour - timezoneOffset, minute, 0, 0);
            if (targetDate.getTime() <= Date.now()) targetDate.setUTCDate(targetDate.getUTCDate() + 1);
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
            warned: false
        });

        setReminderTimeout(newReminder, interaction.client);

        const embed = new EmbedBuilder().setTitle('⏰ Напоминание создано!').setColor('#57F287')
            .addFields({ name: 'Текст', value: text }, { name: 'Когда', value: `<t:${Math.floor(nextTime / 1000)}:f>` })
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
            const channel = await client.channels.fetch(reminder.channelId);
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
                    dbReminder.nextTime += 86400000; // +24 часа
                    dbReminder.warned = false;
                    await dbReminder.save();
                    setReminderTimeout(dbReminder, client);
                }
            }
        } catch (e) { console.error(e); }
    }, timeout);
}

module.exports.setReminderTimeout = setReminderTimeout;
