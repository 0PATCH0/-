const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Подключаем наш веб-сервер
const { startWebServer } = require('./web'); 

// Подключаем модель для напоминаний
const { Reminder } = require('./models'); 

// --- КЛИЕНТ БОТА ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

client.commands = new Collection();
const commandsArray = [];

// Загрузка команд
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

// Регистрация слэш-команд
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

// Обработка команд
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Ошибка при выполнении!', ephemeral: true });
    }
});

// --- ЗАПУСК БОТА И БАЗЫ ДАННЫХ ---
client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    await registerCommands(); 

    // Восстановление напоминаний из БД
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

// Подключение к БД и запуск
console.log('Подключение к MongoDB...');
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        
        // Запускаем сайт
        startWebServer(client); 
        
        // Запускаем бота
        client.login(process.env.TOKEN);
    })
    .catch(err => {
        console.error('❌ Ошибка подключения к БД:', err);
    });
