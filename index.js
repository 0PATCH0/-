const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv6first');

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

// ... (Функции registerCommands, refreshRosterMessage, updateRosterForGuild, scheduleUpdate и обработчики interactionCreate/guildMemberUpdate остаются такими же, как в прошлом коде) ...

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
            } catch (err) { console.error(`[DISCORD] ❌ Ошибка локальных команд для ${guild.name}:`, err.message); }
        });
    } catch (error) { console.error('[DISCORD] ❌ Ошибка регистрации команд:', error); }
}

async function refreshRosterMessage(guildId, client) {
    try {
        const msgRecord = await RosterMessage.findOne({ guildId });
        if (!msgRecord) return; 
        const config = await RosterConfig.findOne({ guildId });
        const rosterData = await Roster.findOne({ guildId });
        if (!config || !rosterData) return;
        const embedsToSend = [];
        let totalUnique = new Set();
        config.columns.forEach((col) => {
            const roleData = rosterData.data[col.roleId] || [];
            roleData.forEach(m => totalUnique.add(m.id));
            let memberList = roleData.length > 0 ? roleData.map(m => `<@${m.id}>`).join('\n') : '*Никого нет*';
            if (memberList.length > 4000) memberList = memberList.substring(0, 4000) + '\n...и другие';
            embedsToSend.push(new EmbedBuilder().setTitle(col.name).setColor(col.color || '#5865F2').setDescription(memberList).setFooter({ text: `Участников: ${roleData.length} • Обновлено: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` }));
        });
        embedsToSend.unshift(new EmbedBuilder().setTitle('🛡️ Состав гильдии').setColor('#2b2d31').setDescription(`**Всего уникальных участников:** ${totalUnique.size}`).setTimestamp());
        const channel = await client.channels.fetch(msgRecord.channelId).catch(() => null);
        if (!channel) return;
        const message = await channel.messages.fetch(msgRecord.messageId).catch(() => null);
        if (!message) { await RosterMessage.deleteOne({ guildId }); return; }
        await message.edit({ embeds: embedsToSend.slice(0, 10) });
    } catch (e) { console.error('[ROSTER] Ошибка при обновлении сообщения:', e); }
}

async function updateRosterForGuild(guild) {
    try {
        await guild.members.fetch({ time: 120000, force: true });
        const rolesData = {};
        guild.roles.cache.forEach(role => {
            if (role.id === guild.id || role.managed) return; 
            const membersInRole = role.members.filter(m => !m.user.bot).map(m => ({ id: m.id, name: m.displayName }));
            if (membersInRole.length > 0) rolesData[role.id] = membersInRole;
        });
        await Roster.findOneAndUpdate({ guildId: guild.id }, { data: rolesData, lastUpdated: new Date() }, { upsert: true });
        await refreshRosterMessage(guild.id, client);
    } catch (e) { console.error(`[ROSTER] Ошибка при обновлении ${guild.name}: ${e.message}`); }
}

const updateTimers = new Map();
function scheduleUpdate(guildId) {
    if (updateTimers.has(guildId)) clearTimeout(updateTimers.get(guildId));
    updateTimers.set(guildId, setTimeout(async () => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) await updateRosterForGuild(guild);
        updateTimers.delete(guildId);
    }, 5000));
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); } catch (error) { console.error(error); await interaction.reply({ content: 'Ошибка при выполнении!', ephemeral: true }); }
    }
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('rr_')) {
            const roleId = interaction.customId.split('_')[1];
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) return interaction.reply({ content: 'Роль удалена.', ephemeral: true });
            try {
                const config = await ReactionRole.findOne({ messageId: interaction.message.id });
                const mode = config ? config.mode : 'multiple';
                if (mode === 'single' && config) { for (const r of config.roles) { if (r.roleId !== roleId && member.roles.cache.has(r.roleId)) { await member.roles.remove(r.roleId).catch(() => {}); } } }
                if (member.roles.cache.has(roleId)) { await member.roles.remove(roleId); await interaction.reply({ content: `✅ Вы сняли роль **${role.name}**`, ephemeral: true }); }
                else { await member.roles.add(roleId); await interaction.reply({ content: `✅ Вы получили роль **${role.name}**`, ephemeral: true }); }
            } catch (error) { await interaction.reply({ content: 'Не удалось изменить роль.', ephemeral: true }); }
        }
        if (interaction.customId.startsWith('show_class_')) {
            const classRole = interaction.customId.replace('show_class_', '');
            const { PlayerProfile } = require('./models');
            const profiles = await PlayerProfile.find({ $or: [ { classRole: classRole, guildId: interaction.guild.id }, { classRole: classRole, isGlobal: true } ] });
            if (profiles.length === 0) return interaction.reply({ content: `Пока никто не указал класс **${classRole}**.`, ephemeral: true });
            const embed = new EmbedBuilder().setTitle(`📋 Список класса: ${classRole}`).setColor('#d4af37').setDescription(profiles.map(p => `**${p.characters[0].gameNickname || 'Без ника'}** • ${p.characters[0].weapon || 'Оружие не указано'} • <@${p.userId}>`).join('\n')).setFooter({ text: `Всего участников: ${profiles.length}` });
            await interaction.reply({ embeds: [embed] });
        }
    }
});

client.once('ready', async () => {
    console.log(`Бот ${client.user.tag} в сети!`);
    setTimeout(async () => { await registerCommands(); }, 2000);
    client.guilds.cache.forEach(guild => updateRosterForGuild(guild));
    try { const reminders = await Reminder.find(); if (reminders.length > 0) { const remindCommand = require('./commands/remind.js'); reminders.forEach(rem => remindCommand.setReminderTimeout(rem, client)); } } catch (e) { console.error(e); }
});

client.on('guildMemberUpdate', (oldMember, newMember) => { if (oldMember.roles.cache.size !== newMember.roles.cache.size) scheduleUpdate(newMember.guild.id); });
client.on('guildMemberAdd', (member) => scheduleUpdate(member.guild.id));
client.on('guildMemberRemove', (member) => scheduleUpdate(member.guild.id));

module.exports.updateRosterForGuild = updateRosterForGuild;
module.exports.refreshRosterMessage = refreshRosterMessage;

// --- ГЛАВНОЕ: СНАЧАЛА САЙТ, ПОТОМ БОТ ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        
        // 1. Сначала запускаем веб-сервер, чтобы Render увидел порт
        console.log('🌐 Запуск веб-панели...');
        startWebServer(client); 
        
        // 2. И только потом пытаемся войти в Discord
        console.log('⏳ Попытка входа в Discord...');
        let token = process.env.TOKEN ? process.env.TOKEN.trim().replace(/['"]/g, '') : null;
        
        if (!token) {
            console.error('❌ ОШИБКА: Переменная TOKEN пуста!');
            return;
        }

        // Добавляем таймаут, чтобы бот не висел вечно
        const loginPromise = client.login(token);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут подключения к Discord (20 сек)')), 20000));

        Promise.race([loginPromise, timeoutPromise])
            .then(() => console.log('✅ Вход в Discord выполнен успешно!'))
            .catch(err => {
                console.error('❌ ОШИБКА ВХОДА В DISCORD:');
                console.error(err.message);
            });
    })
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));
