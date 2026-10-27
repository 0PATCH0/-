const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { startWebServer } = require('./web'); 
const { Reminder, ReactionRole, Roster } = require('./models');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // ВАЖНО: Добавлено для работы с участниками
    ] 
});

client.commands = new Collection();
const commandsArray = [];

// Загрузка команд
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('Слэш-команды успешно зарегистрированы!');
    } catch (error) { console.error(error); }
}

// Функция для принудительного обновления данных
async function forceFetchMembers(guild) {
    console.log(`[ROSTER] Начинаю обновление участников для ${guild.name}...`);
    try {
        // Используем опцию force: true и таймаут 60 сек, чтобы точно дождаться ответа
        const members = await guild.members.fetch({ time: 60000, force: true });
        console.log(`[ROSTER] Успешно загружено ${members.size} участников.`);
        return true;
    } catch (e) {
        console.error(`[ROSTER] Ошибка при загрузке участников: ${e.message}`);
        return false;
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Ошибка при выполнении!', ephemeral: true });
    }
});

client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    await registerCommands();

    // Первичная загрузка для всех серверов
    client.guilds.cache.forEach(guild => forceFetchMembers(guild));

    // Периодическое обновление каждые 30 минут (чтобы сайт не показывал устаревшие данные)
    setInterval(() => {
        client.guilds.cache.forEach(guild => forceFetchMembers(guild));
    }, 30 * 60 * 1000);
    
    // Восстановление напоминаний
    try {
        const reminders = await Reminder.find();
        if (reminders.length > 0) {
            const remindCommand = require('./commands/remind.js');
            reminders.forEach(rem => remindCommand.setReminderTimeout(rem, client));
        }
    } catch (e) { console.error(e); }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        startWebServer(client); 
        client.login(process.env.TOKEN);
    })
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));
