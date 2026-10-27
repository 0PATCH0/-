const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { startWebServer } = require('./web'); 
const { Reminder, ReactionRole } = require('./models');

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
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('Слэш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error('Ошибка регистрации:', error);
    }
}

client.on('interactionCreate', async interaction => {
    // 1. Стандартные слэш-команды
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); } catch (error) { console.error(error); }
    }

    // 2. Кнопки Ролей по кнопкам
    if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
        const roleId = interaction.customId.split('_')[1];
        const member = interaction.member;
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) return interaction.reply({ content: 'Роль удалена.', ephemeral: true });

        try {
            const config = await ReactionRole.findOne({ messageId: interaction.message.id });
            const mode = config ? config.mode : 'multiple';

            if (mode === 'single' && config) {
                for (const r of config.roles) {
                    if (r.roleId !== roleId && member.roles.cache.has(r.roleId)) {
                        await member.roles.remove(r.roleId).catch(() => {});
                    }
                }
            }

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                await interaction.reply({ content: `✅ Вы сняли роль **${role.name}**`, ephemeral: true });
            } else {
                await member.roles.add(roleId);
                await interaction.reply({ content: `✅ Вы получили роль **${role.name}**`, ephemeral: true });
            }
        } catch (error) {
            await interaction.reply({ content: 'Не удалось изменить роль. Проверьте иерархию.', ephemeral: true });
        }
    }
});

client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    await registerCommands(); 

    // Восстанавливаем напоминания
    try {
        const reminders = await Reminder.find();
        if (reminders.length > 0) {
            const remindCommand = require('./commands/remind.js');
            reminders.forEach(reminder => remindCommand.setReminderTimeout(reminder, client));
        }
    } catch (e) { console.error(e); }

    // ПРИНУДИТЕЛЬНО ЗАГРУЖАЕМ ВСЕХ УЧАСТНИКОВ В КЭШ (в фоне, чтобы не блокировать бота)
    console.log("Начинаю фоновую загрузку участников...");
    client.guilds.cache.forEach(guild => {
        guild.members.fetch()
            .then(members => console.log(`✅ Загружено ${members.size} участников для сервера ${guild.name}`))
            .catch(err => console.log(`❌ Не удалось загрузить участников для ${guild.name}: ${err.message}`));
    });
});
