const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ReactionRole, Settings, Reminder, SentMessage, Roster, RosterConfig, RosterMessage, Log } = require('./models');

const app = express();
app.use(express.json());
app.use(session({ secret: 'super_secret_bot_key_123', resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'https://discord-bot-24oz.onrender.com/auth/discord/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- МИДДЛВАР: Проверка прав (Админ или Модератор из БД) ---
async function isModerator(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: 'Доступ запрещен' });

    // 1. Проверяем права Администратора Discord
    if ((BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8)) return next();

    // 2. Проверяем роли модератора из БД
    const settings = await Settings.findOne({ guildId: req.params.id });
    const client = req.app.get('botClient');
    const discordGuild = client.guilds.cache.get(req.params.id);
    
    if (settings && settings.modRoles && discordGuild) {
        const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
        if (member && member.roles.cache.some(r => settings.modRoles.includes(r.id))) {
            return next();
        }
    }

    return res.status(403).json({ error: 'Требуются права модератора' });
}

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- СТРАНИЦЫ ---
const pages = ['dashboard', 'guild', 'reactionroles', 'reminders', 'moderation', 'custom', 'roster', 'roster-config', 'logs'];
pages.forEach(page => {
    app.get(`/manage/:id/${page === 'guild' ? '' : page}`, (req, res) => {
        if (!req.user) return res.redirect('/');
        res.sendFile(path.join(__dirname, 'public', `${page === 'guild' ? 'guild' : page}.html`));
    });
});
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });

// --- API ---
app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    // Показываем все серверы, где есть права админа ИЛИ где бот настроен как модератор (для простоты оставим админов)
    const adminGuilds = req.user.guilds.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));
    res.json({ user: req.user, guilds: adminGuilds });
});

app.get('/api/guild/:id', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    const roles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name }));
    res.json({ name: guild.name, roles });
});

// ЛОГИ
app.get('/api/guild/:id/logs', isModerator, async (req, res) => {
    const logs = await Log.find({ guildId: req.params.id }).sort({ date: -1 }).limit(100);
    res.json(logs);
});

// ROSTER
app.get('/api/guild/:id/roster', isModerator, async (req, res) => { let r = await Roster.findOne({ guildId: req.params.id }); res.json(r || { data: {}, lastUpdated: null }); });
app.post('/api/guild/:id/roster/update', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    try { const { updateRosterForGuild } = require('./index.js'); await updateRosterForGuild(guild); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});
app.get('/api/guild/:id/roster-config', isModerator, async (req, res) => { let c = await RosterConfig.findOne({ guildId: req.params.id }); res.json(c || { columns: [] }); });
app.post('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    const processed = req.body.columns.map(col => {
        let n = col.name.replace(/:([a-zA-Z0-9_]+):/g, (m, eName) => { const e = guild.emojis.cache.find(em => em.name === eName); return e ? `<:${e.name}:${e.id}>` : m; });
        return { roleId: col.roleId, name: n, color: col.color || '#5865F2' };
    });
    await RosterConfig.findOneAndUpdate({ guildId: req.params.id }, { columns: processed }, { upsert: true });
    const { refreshRosterMessage } = require('./index.js'); await refreshRosterMessage(req.params.id, client);
    res.json({ success: true });
});
app.delete('/api/guild/:id/roster/message', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const records = await RosterMessage.find({ guildId: req.params.id });
    for (const r of records) { try { const ch = await client.channels.fetch(r.channelId); const m = await ch.messages.fetch(r.messageId); if (m) await m.delete(); } catch (e){} }
    await RosterMessage.deleteMany({ guildId: req.params.id }); res.json({ success: true });
});

// ОСТАЛЬНЫЕ API (Moderation, Embes, ReactionRoles, Reminders)
// (Сокращено для читаемости, добавь isModerator в начало каждой)
app.get('/api/guild/:id/moderation', isModerator, async (req, res) => { let s = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] }); res.json(s); });
app.post('/api/guild/:id/moderation', isModerator, async (req, res) => { await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles: req.body.modRoles }, { upsert: true }); res.json({ success: true }); });

function startWebServer(botClient) { app.set('botClient', botClient); app.listen(process.env.PORT || 3000, () => console.log(`🌐 Веб-панель запущена`)); }
module.exports = { startWebServer };
