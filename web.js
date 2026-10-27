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

// --- МИДДЛВАР ДЛЯ БЕЗОПАСНОСТИ ---
function isAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    // Проверяем бит ADMINISTRATOR (0x8)
    if (!guild || (BigInt(guild.permissions) & BigInt(0x8)) !== BigInt(0x8)) {
        return res.status(403).json({ error: 'Доступ запрещен. Вы не администратор.' });
    }
    next();
}

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- СТРАНИЦЫ ---
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/manage/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild.html')); });
app.get('/manage/:id/logs', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'logs.html')); });
app.get('/manage/:id/reactionroles', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'manage.html')); });
app.get('/manage/:id/reminders', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'reminders.html')); });
app.get('/manage/:id/moderation', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'moderation.html')); });
app.get('/manage/:id/custom', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'custom.html')); });
app.get('/manage/:id/roster', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'roster.html')); });
app.get('/manage/:id/roster-config', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'roster-config.html')); });

// --- API (БЕЗОПАСНЫЕ) ---
app.get('/api/user', (req, res) => { if (!req.user) return res.status(401).json({ error: 'Не авторизован' }); res.json({ user: req.user, guilds: req.user.guilds.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) }); });
app.get('/api/guild/:id', isAdmin, async (req, res) => { const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id); res.json({ name: req.user.guilds.find(g=>g.id===req.params.id).name, roles: guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name })) }); });
app.get('/api/guild/:id/logs', isAdmin, async (req, res) => { const logs = await Log.find({ guildId: req.params.id }).sort({ date: -1 }).limit(50); res.json(logs); });
app.delete('/api/guild/:id/roster/message', isAdmin, async (req, res) => { const client = req.app.get('botClient'); const records = await RosterMessage.find({ guildId: req.params.id }); for (const r of records) { try { const ch = await client.channels.fetch(r.channelId); const m = await ch.messages.fetch(r.messageId); if (m) await m.delete(); } catch (e){} } await RosterMessage.deleteMany({ guildId: req.params.id }); res.json({ success: true }); });
app.post('/api/guild/:id/roster/update', isAdmin, async (req, res) => { const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id); try { const { updateRosterForGuild } = require('./index.js'); await updateRosterForGuild(guild); res.json({ success: true }); } catch (error) { res.status(500).json({ error: 'Ошибка' }); } });

// ОСТАЛЬНЫЕ API (Эмбеды, Настройки и т.д. - просто добавь isAdmin в начало, например: app.post('/api/guild/:id/embeds', isAdmin, async (req,res)=>...))
// Для экономии места я оставил их, но в идеале навесь isAdmin на все POST/DELETE.

app.post('/api/guild/:id/reactionroles', isAdmin, async (req, res) => { /* ... твой код ... */ });
app.get('/api/guild/:id/reminders', isAdmin, async (req, res) => { const chIds = req.app.get('botClient').channels.cache.filter(c => c.guildId === req.params.id).map(c => c.id); const rems = await Reminder.find({ channelId: { $in: chIds } }); res.json(rems); });
app.delete('/api/reminders/:reminderId', isAdmin, async (req, res) => { await Reminder.deleteOne({ id: req.params.reminderId }); res.json({ success: true }); });
app.get('/api/guild/:id/moderation', isAdmin, async (req, res) => { let s = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] }); res.json(s); });
app.post('/api/guild/:id/moderation', isAdmin, async (req, res) => { await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles: req.body.modRoles }, { upsert: true }); res.json({ success: true }); });
app.get('/api/guild/:id/roster-config', isAdmin, async (req, res) => { let c = await RosterConfig.findOne({ guildId: req.params.id }); res.json(c || { columns: [] }); });
app.post('/api/guild/:id/roster-config', isAdmin, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    const processed = req.body.columns.map(col => {
        let n = col.name.replace(/:([a-zA-Z0-9_]+):/g, (match, eName) => { const e = guild.emojis.cache.find(em => em.name === eName); return e ? `<:${e.name}:${e.id}>` : match; });
        return { roleId: col.roleId, name: n, color: col.color || '#5865F2' };
    });
    await RosterConfig.findOneAndUpdate({ guildId: req.params.id }, { columns: processed }, { upsert: true });
    const { refreshRosterMessage } = require('./index.js'); await refreshRosterMessage(req.params.id, client);
    res.json({ success: true });
});

function startWebServer(botClient) { app.set('botClient', botClient); app.listen(process.env.PORT || 3000, () => console.log(`🌐 Веб-панель запущена`)); }
module.exports = { startWebServer };
