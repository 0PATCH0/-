const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { startWebServer } = require('./web'); 
const { Reminder, ReactionRole, Roster, RosterConfig, RosterMessage } = require('./models');

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

console.log(`[COMMANDS] Найдено файлов в командах: ${commandFiles.length}`);

for (const file of commandFiles) {
    try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsArray.push(command.data.toJSON());
            console.log(`[COMMANDS] ✅ Загружена команда: /${command.data.name}`);
        }
    } catch (error) {
        console.error(`[COMMANDS] ❌ Ошибка загрузки ${file}:`, error.message);
    }
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log(`[DISCORD] Обновление ${commandsArray.length} слэш-команд.`);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('[DISCORD] ✅ Глобальные команды зарегистрированы!');
        
        client.guilds.cache.forEach(async (guild) => {
            try {
                await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: commandsArray });
                console.log(`[DISCORD] ✅ Локальные команды для "${guild.name}" обновлены!`);
            } catch (err) {
                console.error(`[DISCORD] ❌ Ошибка локальных команд для ${guild.name}:`, err.message);
            }
        });
    } catch (error) {
        console.error('[DISCORD] ❌ Ошибка регистрации команд:', error);
    }
}

// ... (Функции updateRosterForGuild, refreshRosterMessage, scheduleUpdate остаются без изменений) ...
// Вставь их сюда из предыдущего кода, они рабочие.

client.on('interactionCreate', async interaction => {
    // ... (Обработчик команд и кнопок остается без изменений) ...
});

client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    setTimeout(async () => { await registerCommands(); }, 2000);
    client.guilds.cache.forEach(guild => updateRosterForGuild(guild));
    try {
        const reminders = await Reminder.find();
        if (reminders.length > 0) {
            const remindCommand = require('./commands/remind.js');
            reminders.forEach(rem => remindCommand.setReminderTimeout(rem, client));
        }
    } catch (e) { console.error(e); }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) scheduleUpdate(newMember.guild.id);
});
client.on('guildMemberAdd', (member) => scheduleUpdate(member.guild.id));
client.on('guildMemberRemove', (member) => scheduleUpdate(member.guild.id));

module.exports.updateRosterForGuild = updateRosterForGuild;
module.exports.refreshRosterMessage = refreshRosterMessage;

// --- ГЛАВНОЕ ИЗМЕНЕНИЕ: ПРАВИЛЬНЫЙ ПОРЯДОК ЗАПУСКА ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        
        console.log('⏳ Попытка входа в Discord...');
        let token = process.env.TOKEN ? process.env.TOKEN.trim().replace(/['"]/g, '') : null;
        
        if (!token) {
            console.error('❌ ОШИБКА: Переменная TOKEN пуста!');
            return;
        }

        // Сначала запускаем бота
        client.login(token)
            .then(() => {
                console.log('✅ Вход в Discord выполнен успешно!');
                // И только ПОСЛЕ этого запускаем сайт
                console.log('🌐 Запуск веб-панели...');
                startWebServer(client); 
            })
            .catch(err => {
                console.error('❌ ОШИБКА ВХОДА В DISCORD:');
                console.error(err.message);
            });
    })
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));
