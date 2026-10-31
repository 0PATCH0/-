const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
    ReactionRole, Settings, Reminder, SentMessage, Roster, RosterConfig, RosterMessage, Log, Guide, PlayerProfile, Event 
} = require('./models');

const OWNER_ID = '439798786059927552'; // Твой ID

const app = express();
app.use(express.json());
app.use(session({ secret: 'super_secret_bot_key_123', resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID, clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'https://patchitos1234.fly.dev/auth/discord/callback', scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

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

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// СТРАНИЦЫ
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/manage/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild.html')); });
app.get('/manage/:id/events', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'events.html')); });
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
app.get('/profile', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'profile.html')); });

// API ПОЛЬЗОВАТЕЛЯ
app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const client = req.app.get('botClient');
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const userGuilds = req.user.guilds.filter(g => botGuildIds.includes(g.id));
    res.json({ user: req.user, guilds: userGuilds });
});

app.get('/api/guild/:id', isModerator, async (req, res) => {
    const client = req.app.get('botClient'); const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });
    const roles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name }));
    res.json({ name: guild.name, roles });
});

app.get('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const targetUserId = req.query.user || req.user.id;
    
    let profile = await PlayerProfile.findOne({ userId: targetUserId, guildId: req.params.guildId });
    if (!profile) profile = await PlayerProfile.findOne({ userId: targetUserId, isGlobal: true });
    
    if (!profile) {
        profile = { 
            userId: targetUserId, guildId: req.params.guildId, isGlobal: false, 
            characters: [ { gameNickname: '', guildName: '', roles: [], martialArts: [], bio: '', buildUrl: '', builds: { PvE: { innerWays: [], mysticSkills: [] }, PvP: { innerWays: [], mysticSkills: [] } } } ] 
        };
    }
    res.json(profile);
});

app.post('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const { characters, isGlobal, targetUser } = req.body;
    const finalUserId = targetUser || req.user.id;

    try {
        await PlayerProfile.findOneAndUpdate(
            { userId: finalUserId, guildId: req.params.guildId }, 
            { characters, isGlobal }, 
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) {
        console.error('ОШИБКА БАЗЫ:', e);
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

app.delete('/api/profile/:guildId', async (req, res) => { if (!req.user) return res.status(401).json({ error: 'Не авторизован' }); await PlayerProfile.findOneAndDelete({ userId: req.user.id, guildId: req.params.guildId }); res.json({ success: true }); });
app.get('/api/guild/:id/profiles', isModerator, async (req, res) => { const client = req.app.get('botClient'); const discordGuild = client.guilds.cache.get(req.params.id); const profiles = await PlayerProfile.find({ $or: [ { guildId: req.params.id }, { isGlobal: true } ] }); const enriched = await Promise.all(profiles.map(async (p) => { const member = await discordGuild.members.fetch(p.userId).catch(() => null); return { ...p._doc, discordName: member ? member.user.username : 'Неизвестный', avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png' }; })); res.json(enriched); });
app.delete('/api/guild/:id/profiles/:userId', isModerator, async (req, res) => { await PlayerProfile.findOneAndDelete({ userId: req.params.userId, guildId: req.params.id }); res.json({ success: true }); });

// ... (ОСТАЛЬНЫЕ API БЕЗ ИЗМЕНЕНИЙ) ...
app.get('/api/guild/:id/events', isModerator, async (req, res) => { const events = await Event.find({ guildId: req.params.id }).sort({ date: 1 }); res.json(events); });
app.post('/api/guild/:id/events', isModerator, async (req, res) => { try { const newEvent = await Event.create({ guildId: req.params.id, ...req.body, creatorId: req.user.id, attendees: [] }); res.json({ success: true, event: newEvent }); } catch (e) { res.status(500).json({ error: 'Ошибка' }); } });
app.post('/api/guild/:id/events/:eventId/join', async (req, res) => { if (!req.user) return res.status(401).json({ error: 'Не авторизован' }); try { const event = await Event.findById(req.params.eventId); if (!event) return res.status(404).json({ error: 'Не найдено' }); const userId = req.user.id; if (event.attendees.includes(userId)) { event.attendees = event.attendees.filter(id => id !== userId); } else { event.attendees.push(userId); } await event.save(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Ошибка' }); } });
app.delete('/api/guild/:id/events/:eventId', isModerator, async (req, res) => { await Event.findByIdAndDelete(req.params.eventId); res.json({ success: true }); });

app.get('/api/guild/:id/guides', isModerator, async (req, res) => { res.json(await Guide.find({ guildId: req.params.id }).sort({ date: -1 })); });
app.get('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => { res.json(await Guide.findById(req.params.guideId)); });
app.post('/api/guild/:id/guides', isModerator, async (req, res) => { await Guide.create({ guildId: req.params.id, ...req.body }); res.json({ success: true }); });
app.put('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => { await Guide.findByIdAndUpdate(req.params.guideId, req.body); res.json({ success: true }); });
app.delete('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => { await Guide.findByIdAndDelete(req.params.guideId); res.json({ success: true }); });
app.get('/api/guild/:id/logs', isModerator, async (req, res) => { res.json(await Log.find({ guildId: req.params.id }).sort({ date: -1 }).limit(100)); });
app.get('/api/guild/:id/moderation', isModerator, async (req, res) => { let s = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] }); res.json(s); });
app.post('/api/guild/:id/moderation', isModerator, async (req, res) => { await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles: req.body.modRoles }, { upsert: true }); res.json({ success: true }); });

app.use((req, res) => { res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); });

function startWebServer(botClient) { app.set('botClient', botClient); app.listen(process.env.PORT || 8080, () => console.log(`🌐 Веб-панель запущена`)); }
module.exports = { startWebServer };
