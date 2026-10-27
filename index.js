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

// --- ФУНКЦИЯ ОБНОВЛЕНИЯ ВСЕХ СООБЩЕНИЙ В DISCORD ---
async function refreshRosterMessage(guildId, client) {
    try {
        const msgRecords = await RosterMessage.find({ guildId });
        if (msgRecords.length === 0) return; 

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

            embedsToSend.push(new EmbedBuilder()
                .setTitle(col.name).setColor(col.color || '#5865F2').setDescription(memberList)
                .setFooter({ text: `Участников: ${roleData.length} • Обновлено: ${new Date(rosterData.lastUpdated).toLocaleString('ru-RU')}` }));
        });

        embedsToSend.unshift(new EmbedBuilder().setTitle('🛡️ Состав гильдии').setColor('#2b2d31')
            .setDescription(`**Всего уникальных участников:** ${totalUnique.size}`).setTimestamp());

        for (const record of msgRecords) {
            const channel = await client.channels.fetch(record.channelId).catch(() => null);
            if (!channel) {
                await RosterMessage.deleteOne({ _id: record._id }); // Канал удален
                continue;
            }
            const message = await channel.messages.fetch(record.messageId).catch(() => null);
            if (!message) {
                await RosterMessage.deleteOne({ _id: record._id }); // Сообщение удалено
                continue;
            }
            await message.edit({ embeds: embedsToSend.slice(0, 10) });
            console.log(`[ROSTER] Сообщение в канале #${channel.name} обновлено.`);
        }
    } catch (e) {
        console.error('[ROSTER] Ошибка при обновлении сообщений:', e);
    }
}

// ФУНКЦИЯ СБОРА ДАННЫХ
async function updateRosterForGuild(guild) {
    try {
        await guild.members.fetch({ time: 120000, force: true });
        const rolesData = {};
        guild.roles.cache.forEach(role => {
            if (role.id === guild.id || role.managed) return; 
            const membersInRole = role.members.filter(m => !m.user.bot).map(m => ({ id: m.id, name: m.displayName }));
            if (membersInRole.length > 0) rolesData[role.id] = membersInRole;
        });

        await Roster.findOneAndUpdate(
            { guildId: guild.id },
            { data: rolesData, lastUpdated: new Date() },
            { upsert: true }
        );
        console.log(`[ROSTER] База данных для ${guild.name} обновлена.`);
        
        await refreshRosterMessage(guild.id, client);
    } catch (e) {
        console.error(`[ROSTER] Ошибка при обновлении ${guild.name}: ${e.message}`);
    }
}

// ЗАДЕРЖКА ОБНОВЛЕНИЙ (чтобы не спамить при массовой выдаче ролей)
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
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Ошибка при выполнении!', ephemeral: true });
        }
    }

    // Обработка кнопок (Роли и Списки классов)
    if (interaction.isButton()) {
        // Роли по кнопкам (старый код)
        if (interaction.customId.startsWith('rr_')) {
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
                await interaction.reply({ content: 'Не удалось изменить роль.', ephemeral: true });
            }
        }

        // Обработка кнопки "Показать всех" из команды /профиль
        if (interaction.customId.startsWith('show_class_')) {
            const classRole = interaction.customId.replace('show_class_', '');
            const { PlayerProfile } = require('./models');
            
            const profiles = await PlayerProfile.find({ classRole: classRole });
            
            if (profiles.length === 0) {
                return interaction.reply({ content: `Пока никто не указал класс **${classRole}**.`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Список класса: ${classRole}`)
                .setColor('#d4af37')
                .setDescription(profiles.map(p => `**${p.gameNickname || 'Без ника'}** • ${p.weapon || 'Оружие не указано'} • <@${p.userId}>`).join('\n'))
                .setFooter({ text: `Всего участников: ${profiles.length}` });

            await interaction.reply({ embeds: [embed] });
        }
    }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) scheduleUpdate(newMember.guild.id);
});
client.on('guildMemberAdd', (member) => scheduleUpdate(member.guild.id));
client.on('guildMemberRemove', (member) => scheduleUpdate(member.guild.id));

module.exports.updateRosterForGuild = updateRosterForGuild;
module.exports.refreshRosterMessage = refreshRosterMessage;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Успешное подключение к базе данных!');
        startWebServer(client); 
        client.login(process.env.TOKEN);
    })
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));
