const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
    ReactionRole, 
    Settings, 
    Reminder, 
    SentMessage, 
    Roster, 
    RosterConfig, 
    RosterMessage, 
    Log, 
    Guide, 
    PlayerProfile 
} = require('./models');

// ==========================================
// ВАЖНО: Укажи здесь свой Discord ID (только цифры)
// ==========================================
const OWNER_ID = '439798786059927552'; 

const app = express();
app.use(express.json()); 
app.use(session({ secret: 'super_secret_bot_key_123', resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID, 
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'https://patchitos1234.fly.dev/auth/discord/callback', 
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ==========================================
// МИДДЛВАРЫ БЕЗОПАСНОСТИ
// ==========================================

async function isModerator(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    if (req.user.id === OWNER_ID) return next();

    const guild = req.user.guilds.find(g => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: 'Доступ запрещен' });
    if ((BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8)) return next();

    const settings = await Settings.findOne({ guildId: req.params.id });
    const client = req.app.get('botClient');
    const discordGuild = client.guilds.cache.get(req.params.id);
    
    if (settings && settings.modRoles && discordGuild) {
        const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
        if (member && member.roles.cache.some(r => settings.modRoles.includes(r.id))) return next();
    }
    return res.status(403).json({ error: 'Требуются права модератора' });
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// ==========================================
// СТРАНИЦЫ
// ==========================================
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/manage/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild.html')); });
app.get('/manage/:id/guides', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guides.html')); });
app.get('/manage/:id/guides/edit/:guideId', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guide-edit.html')); });
app.get('/manage/:id/reactionroles', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'manage.html')); });
app.get('/manage/:id/reminders', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'reminders.html')); });
app.get('/manage/:id/moderation', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'moderation.html')); });
app.get('/manage/:id/custom', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'custom.html')); });
app.get('/manage/:id/roster', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'roster.html')); });
app.get('/manage/:id/roster-config', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'roster-config.html')); });
app.get('/manage/:id/logs', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'logs.html')); });
app.get('/manage/:id/profiles', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'profiles-admin.html')); });

// Страница профиля (доступна всем, кто авторизован)
app.get('/profile', (req, res) => { 
    if (!req.user) return res.redirect('/'); 
    res.sendFile(path.join(__dirname, 'public', 'profile.html')); 
});

// ==========================================
// API ПРОФИЛЕЙ
// ==========================================

// Получить профиль (свой или чужой, если админ)
app.get('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    const targetUserId = req.query.user || req.user.id;
    
    if (targetUserId !== req.user.id) {
        const guild = req.user.guilds.find(g => g.id === req.params.guildId);
        if (!guild || (BigInt(guild.permissions) & BigInt(0x8)) !== BigInt(0x8)) {
             if (req.user.id !== OWNER_ID) {
                 return res.status(403).json({ error: 'Только админ может редактировать чужие профили' });
             }
        }
    }

    let profile = await PlayerProfile.findOne({ userId: targetUserId, guildId: req.params.guildId });
    
    if (!profile) {
        profile = await PlayerProfile.findOne({ userId: targetUserId, isGlobal: true });
    }

    if (!profile) {
        profile = { 
            userId: targetUserId, 
            guildId: req.params.guildId,
            isGlobal: false, 
            characters: [ { gameNickname: '', guildName: '', roles: [], martialArts: [], weapons: [], bio: '' } ] 
        };
    }
    res.json(profile);
});

// Сохранить профиль
app.post('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const { characters, isGlobal, targetUser } = req.body;
    
    const finalUserId = targetUser || req.user.id;

    if (finalUserId !== req.user.id) {
        const guild = req.user.guilds.find(g => g.id === req.params.guildId);
        if (!guild || (BigInt(guild.permissions) & BigInt(0x8)) !== BigInt(0x8)) {
             if (req.user.id !== OWNER_ID) {
                 return res.status(403).json({ error: 'Нет прав' });
             }
        }
    }

    // Обновляем профиль, сохраняя массивы
    await PlayerProfile.findOneAndUpdate(
        { userId: finalUserId, guildId: req.params.guildId },
        { characters, isGlobal },
        { upsert: true }
    );
    res.json({ success: true });
});

// Удалить СВОЙ профиль
app.delete('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    await PlayerProfile.findOneAndDelete({ userId: req.user.id, guildId: req.params.guildId });
    res.json({ success: true });
});

// Получить все профили для сервера (только модераторы)
app.get('/api/guild/:id/profiles', isModerator, async (req, res) => {
    const client = req.app.get('botClient');
    const discordGuild = client.guilds.cache.get(req.params.id);
    
    // Показываем профили этого сервера ИЛИ глобальные
    const profiles = await PlayerProfile.find({ 
        $or: [ { guildId: req.params.id }, { isGlobal: true } ] 
    });

    const enriched = await Promise.all(profiles.map(async (p) => {
        const member = await discordGuild.members.fetch(p.userId).catch(() => null);
        return { 
            ...p._doc, 
            discordName: member ? member.user.username : 'Неизвестный', 
            avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png' 
        };
    }));
    res.json(enriched);
});

// УДАЛЕНИЕ ЧУЖОГО ПРОФИЛЯ (Только Админ сервера или Создатель бота)
app.delete('/api/guild/:id/profiles/:userId', isModerator, async (req, res) => {
    // Проверяем, является ли текущий пользователь Админом этого сервера
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    const isAdmin = guild && (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8);

    // Если он не админ и не создатель бота - запрещаем
    if (!isAdmin && req.user.id !== OWNER_ID) {
        return res.status(403).json({ error: 'Только администратор сервера может удалять профили' });
    }

    // Ищем профиль
    const profile = await PlayerProfile.findOne({ userId: req.params.userId, guildId: req.params.id });
    
    if (!profile) {
        // Если локального нет, ищем глобальный
        const globalProfile = await PlayerProfile.findOne({ userId: req.params.userId, isGlobal: true });
        if (globalProfile) {
            // Удаляем глобальный профиль, так как мы админ
            await PlayerProfile.deleteOne({ userId: req.params.userId, isGlobal: true });
            return res.json({ success: true });
        }
        return res.status(404).json({ error: 'Профиль не найден' });
    }

    // Удаляем локальный профиль
    await PlayerProfile.deleteOne({ userId: req.params.userId, guildId: req.params.id });
    res.json({ success: true });
});


// ==========================================
// ОСТАЛЬНЫЕ API (БЕЗ ИЗМЕНЕНИЙ)
// ==========================================

app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    const client = req.app.get('botClient');
    // Получаем список серверов, где находится бот
    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    // Фильтруем серверы пользователя: оставляем только те, где есть бот
    const userGuilds = req.user.guilds.filter(g => botGuildIds.includes(g.id));
    
    res.json({ user: req.user, guilds: userGuilds });
});

app.get('/api/guild/:id', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });
    const roles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name }));
    res.json({ name: guild.name, roles });
});

app.get('/api/guild/:id/logs', isModerator, async (req, res) => {
    const logs = await Log.find({ guildId: req.params.id }).sort({ date: -1 }).limit(100);
    res.json(logs);
});

app.get('/api/guild/:id/moderation', isModerator, async (req, res) => {
    let s = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] });
    res.json(s);
});

app.post('/api/guild/:id/moderation', isModerator, async (req, res) => {
    await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles: req.body.modRoles }, { upsert: true });
    res.json({ success: true });
});

app.get('/api/guild/:id/roster', isModerator, async (req, res) => {
    let r = await Roster.findOne({ guildId: req.params.id });
    res.json(r || { data: {}, lastUpdated: null });
});

app.post('/api/guild/:id/roster/update', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    try {
        const { updateRosterForGuild } = require('./index.js');
        await updateRosterForGuild(guild);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

app.get('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    let c = await RosterConfig.findOne({ guildId: req.params.id });
    res.json(c || { columns: [] });
});

app.post('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    const processed = req.body.columns.map(col => {
        let n = col.name.replace(/:([a-zA-Z0-9_]+):/g, (m, eName) => {
            const e = guild.emojis.cache.find(em => em.name === eName);
            return e ? `<:${e.name}:${e.id}>` : m;
        });
        return { roleId: col.roleId, name: n, color: col.color || '#5865F2' };
    });
    await RosterConfig.findOneAndUpdate({ guildId: req.params.id }, { columns: processed }, { upsert: true });
    const { refreshRosterMessage } = require('./index.js');
    await refreshRosterMessage(req.params.id, client);
    res.json({ success: true });
});

app.delete('/api/guild/:id/roster/message', isModerator, async (req, res) => {
    const client = req.app.get('botClient');
    const records = await RosterMessage.find({ guildId: req.params.id });
    for (const r of records) {
        try {
            const ch = await client.channels.fetch(r.channelId);
            const m = await ch.messages.fetch(r.messageId);
            if (m) await m.delete();
        } catch (e) {}
    }
    await RosterMessage.deleteMany({ guildId: req.params.id });
    res.json({ success: true });
});

app.post('/api/guild/:id/reactionroles', isModerator, async (req, res) => {
    const { title, desc, color, channelId, mode, roles } = req.body;
    const client = req.app.get('botClient');
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Канал не найден' });
        
        const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color || '#5865F2');
        const actionRows = [];
        let currentRow = new ActionRowBuilder();

        roles.forEach((r, index) => {
            if (index > 0 && index % 5 === 0) { actionRows.push(currentRow); currentRow = new ActionRowBuilder(); }
            const button = new ButtonBuilder().setCustomId(`rr_${r.roleId}`).setLabel(r.label).setStyle(ButtonStyle.Secondary);
            currentRow.addComponents(button);
        });
        if (currentRow.components.length > 0) actionRows.push(currentRow);

        const msg = await channel.send({ embeds: [embed], components: actionRows });
        await ReactionRole.create({ guildId: req.params.id, channelId, messageId: msg.id, mode, roles: roles.map(r => ({ roleId: r.roleId, label: r.label })) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка отправки' });
    }
});

app.get('/api/guild/:id/reminders', isModerator, async (req, res) => {
    const chIds = req.app.get('botClient').channels.cache.filter(c => c.guildId === req.params.id).map(c => c.id);
    const rems = await Reminder.find({ channelId: { $in: chIds } });
    res.json(rems);
});

app.delete('/api/reminders/:reminderId', isModerator, async (req, res) => {
    await Reminder.deleteOne({ id: req.params.reminderId });
    res.json({ success: true });
});

app.get('/api/guild/:id/embeds', isModerator, async (req, res) => {
    const messages = await SentMessage.find({ guildId: req.params.id });
    res.json(messages);
});

app.post('/api/guild/:id/embeds', isModerator, async (req, res) => {
    const { title, description, color, image, footer, author, channelId } = req.body;
    const client = req.app.get('botClient');
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Канал не найден' });
        
        const embed = new EmbedBuilder().setTitle(title || null).setDescription(description || null).setColor(color || '#5865F2');
        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });
        if (author) embed.setAuthor({ name: author });
        
        const msg = await channel.send({ embeds: [embed] });
        await SentMessage.create({ guildId: req.params.id, channelId, messageId: msg.id, title, description, color, image, footer, author });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.put('/api/guild/:id/embeds/:messageId', isModerator, async (req, res) => {
    const { title, description, color, image, footer, author } = req.body;
    const client = req.app.get('botClient');
    try {
        const dbMsg = await SentMessage.findOne({ messageId: req.params.messageId });
        if (!dbMsg) return res.status(404).json({ error: 'Сообщение не найдено' });
        const channel = await client.channels.fetch(dbMsg.channelId).catch(() => null);
        const discordMsg = await channel.messages.fetch(req.params.messageId).catch(() => null);
        if (!discordMsg) return res.status(400).json({ error: 'Удалено' });
        
        const embed = new EmbedBuilder().setTitle(title || null).setDescription(description || null).setColor(color || '#5865F2');
        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });
        if (author) embed.setAuthor({ name: author });
        
        await discordMsg.edit({ embeds: [embed] });
        dbMsg.title = title; dbMsg.description = description; dbMsg.color = color; dbMsg.image = image; dbMsg.footer = footer; dbMsg.author = author;
        await dbMsg.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.delete('/api/guild/:id/embeds/:messageId', isModerator, async (req, res) => {
    const client = req.app.get('botClient');
    try {
        const dbMsg = await SentMessage.findOne({ messageId: req.params.messageId });
        if (dbMsg) {
            const channel = await client.channels.fetch(dbMsg.channelId).catch(() => null);
            if (channel) {
                const discordMsg = await channel.messages.fetch(req.params.messageId).catch(() => null);
                if (discordMsg) await discordMsg.delete().catch(() => {});
            }
            await SentMessage.deleteOne({ messageId: req.params.messageId });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

function startWebServer(botClient) { 
    app.set('botClient', botClient); 
    app.listen(process.env.PORT || 8080, () => console.log(`🌐 Веб-панель запущена`)); 
}

module.exports = { startWebServer };
