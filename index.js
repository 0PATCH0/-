const http = require('http');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- ВЕБ-СЕРВЕР ДЛЯ RENDER (чтобы бот не засыпал) ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive and running 24/7!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Веб-сервер запущен на порту ${PORT}. Render будет счастлив.`);
});
// --------------------------------------------------

// Создаем клиента бота
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

client.commands = new Collection();
const commandsArray = []; // Массив для регистрации слэш-команд

// Загружаем команды из папки commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    } else {
        console.log(`[ВНИМАНИЕ] В команде ${filePath} не хватает свойства "data" или "execute".`);
    }
}

// Функция для регистрации слэш-команд
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log(`Начинаю обновление ${commandsArray.length} слэш-команд.`);
        const clientId = process.env.CLIENT_ID; 
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commandsArray },
        );
        console.log('Слэш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error('Ошибка регистрации команд:', error);
    }
}

// Обработка слэш-команд
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

// Когда бот запускается, регистрируем команды
client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} успешно запущен и готов к работе!`);
    await registerCommands(); 
});

client.login(process.env.TOKEN);
