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
        GatewayIntentBits.GuildMembers
    ] 
});

client.commands = new Collection();
const commandsArray = [];

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

// ФУНКЦИЯ СОХРАНЕНИЯ СПИСКА В БД
async function updateRosterForGuild(guild) {
    try {
        console.log(`[ROSTER] Обновляю данные для ${guild.name}...`);
        // Скачиваем всех участников
        await guild.members.fetch({ time: 120000, force: true });
        
        // Группируем людей по ролям
        const rolesData = {};
        guild.roles.cache.forEach(role => {
            if (role.id === guild.id || role.managed) return; // Пропускаем @everyone и роли ботов
            
            const membersInRole = role.members.filter(m => !m.user.bot).map(m => ({
                id: m.id,
                name: m.displayName
            }));

            if (membersInRole.length > 0) {
                rolesData[role.name] = membersInRole;
            }
        });

        // Сохраняем в MongoDB
        await Roster.findOneAndUpdate(
            { guildId: guild.id },
            { data: rolesData, lastUpdated: new Date() },
            { upsert: true }
        );
        console.log(`[ROSTER] Данные для ${guild.name} сохранены в БД.`);
    } catch (e) {
        console.error(`[ROSTER] Ошибка при обновлении ${guild.name}: ${e.message}`);
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

    // Первичное обновление при старте
    client.guilds.cache.forEach(guild => updateRosterForGuild(guild));

    // АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ КАЖДЫЕ 30 МИНУТ
    setInterval(() => {
        console.log('[ROSTER] Запуск авто-обновления...');
        client.guilds.cache.forEach(guild => updateRosterForGuild(guild));
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

// Глобальный экспорт, чтобы сайт мог вызвать обновление вручную
module.exports.updateRosterForGuild = updateRosterForGuild;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        startWebServer(client); 
        client.login(process.env.TOKEN);
    })
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));
