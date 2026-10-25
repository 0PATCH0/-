const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Загружаем токен

// Создаем клиента бота
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// Коллекция для хранения команд
client.commands = new Collection();

// Указываем путь к папке с командами
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Загружаем все команды из папки commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[ВНИМАНИЕ] В команде ${filePath} не хватает свойства "data" или "execute".`);
    }
}

// Событие: бот запустился
client.once('ready', () => {
    console.log(`Бот ${client.user.tag} успешно запущен и готов к работе!`);
});

// Обработка слэш-команд (взаимодействий)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`Команда ${interaction.commandName} не найдена.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Произошла ошибка при выполнении команды!', ephemeral: true });
    }
});

// Логин в Discord
client.login(process.env.TOKEN);
