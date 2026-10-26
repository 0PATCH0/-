const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { startWebServer } = require('./web'); 
const { Reminder, ReactionRole } = require('./models'); // Добавили ReactionRole

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

client.commands = new Collection();
const commandsArray = [];

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log(`Обновление ${commandsArray.length} слэш-команд.`);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('Слэш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error('Ошибка регистрации:', error);
    }
}

// ОБРАБОТКА ВЗАИМОДЕЙСТВИЙ (Слэш-команды и Кнопки)
client.on('interactionCreate', async interaction => {
    // 1. Если это слэш-команда (/help, /сбор и т.д.)
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Ошибка при выполнении!', ephemeral: true });
        }
    }

    // 2. Если нажата кнопка Ролей по кнопкам
    if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
        const roleId = interaction.customId.split('_')[1];
        const member = interaction.member;
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) return interaction.reply({ content: 'Роль была удалена с сервера.', ephemeral: true });

        try {
            // Ищем настройку в БД, чтобы узнать режим (single или multiple)
            const config = await ReactionRole.findOne({ messageId: interaction.message.id });
            const mode = config ? config.mode : 'multiple';

            if (mode === 'single') {
                // Если режим "Одна роль", снимаем все другие роли из этой панели
                if (config && config.roles) {
                    for (const r of config.roles) {
                        if (r.roleId !== roleId && member.roles.cache.has(r.roleId)) {
                            await member.roles.remove(r.roleId).catch(() => {});
                        }
                    }
                }
            }

            // Выдаем или снимаем роль (переключатель)
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                await interaction.reply({ content: `✅ Вы сняли роль **${role.name}**`, ephemeral: true });
            } else {
                await member.roles.add(roleId);
                await interaction.reply({ content: `✅ Вы получили роль **${role.name}**`, ephemeral: true });
            }
        } catch (error) {
            console.error('Ошибка при выдаче роли:', error);
            await interaction.reply({ content: 'Не удалось изменить роль. Проверьте, что роль бота находится выше по иерархии.', ephemeral: true });
        }
    }
});

client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    await registerCommands(); 

    try {
        const reminders = await Reminder.find();
        if (reminders.length > 0) {
            console.log(`[БД] Восстановлено ${reminders.length} напоминаний.`);
            const remindCommand = require('./commands/remind.js');
            reminders.forEach(reminder => {
                remindCommand.setReminderTimeout(reminder, client);
            });
        }
    } catch (e) {
        console.error('Ошибка БД при старте:', e);
    }
});

console.log('Подключение к MongoDB...');
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        startWebServer(client); 
        client.login(process.env.TOKEN);
    })
    .catch(err => {
        console.error('❌ Ошибка подключения к БД:', err);
    });
