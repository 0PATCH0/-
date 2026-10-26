const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
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
        .setDescription('Показать и удалить ваши активные напоминания'),

    async execute(interaction) {
        const reminders = loadReminders();
        const userReminders = reminders.filter(r => r.userId === interaction.user.id);

        if (userReminders.length === 0) {
            return interaction.reply({ content: 'У вас нет активных напоминаний.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Ваши напоминания')
            .setDescription('Выберите напоминание из списка ниже, чтобы **удалить** его.')
            .setColor('#5865F2');

        userReminders.forEach((r, i) => {
            const timeUnix = Math.floor(r.nextTime / 1000);
            embed.addFields({
                name: `${i + 1}. ${r.text.length > 50 ? r.text.substring(0, 47) + '...' : r.text}`,
                value: `Сработает: <t:${timeUnix}:f> (<t:${timeUnix}:R>)\nПовтор: ${r.repeat === 'once' ? 'Один раз' : (r.repeat === 'daily' ? 'Каждый день' : 'Каждую неделю')}`,
                inline: false
            });
        });

        // Создаем меню для удаления (максимум 25 пунктов, как позволяет Discord)
        const menu = new StringSelectMenuBuilder()
            .setCustomId('delete_reminder')
            .setPlaceholder('Выберите напоминание для удаления')
            .addOptions(userReminders.slice(0, 25).map(r => ({
                label: r.text.substring(0, 50),
                description: `ID: ${r.id}`,
                value: r.id,
                emoji: '🗑️'
            })));

        const row = new ActionRowBuilder().addComponents(menu);

        const response = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            const deletedId = i.values[0];
            let allReminders = loadReminders();
            
            // Проверяем, что удаляет именно владелец
            const reminderToDelete = allReminders.find(r => r.id === deletedId);
            if (!reminderToDelete || reminderToDelete.userId !== i.user.id) {
                return i.reply({ content: 'Ошибка доступа.', ephemeral: true });
            }

            // Удаляем
            allReminders = allReminders.filter(r => r.id !== deletedId);
            saveReminders(allReminders);

            await i.update({ content: `✅ Напоминание **удалено**!`, embeds: [], components: [] });
        });
    },
};
