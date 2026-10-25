const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`Начинаю обновление ${commands.length} слэш-команд.`);
        // Вставь сюда свой CLIENT_ID из Discord Developer Portal (вкладка General Information)
        const clientId = 'ВСТАВЬ_СЮДА_CLIENT_ID'; 
        
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log('Слэш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error(error);
    }
})();
