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
    // ─── Профили персонажей ────────────────────────────────────────────────
function normalizeProfileCharacters(input) {
    if (!Array.isArray(input)) return [];
    const LIMITS = { mysticSkills: 8, innerWays: 4 };
    return input.slice(0, 3).map(c => {
        const clean = {
            gameNickname: String(c && c.gameNickname || '').trim().slice(0, 64),
            guildName: String(c && c.guildName || '').trim().slice(0, 64),
            bio: String(c && c.bio || '').slice(0, 500),
            builds: { PvE: { mysticSkills: [], innerWays: [] }, PvP: { mysticSkills: [], innerWays: [] } }
        };
        ['PvE', 'PvP'].forEach(tab => {
            const src = (c && c.builds && c.builds[tab]) || {};
            ['mysticSkills', 'innerWays'].forEach(key => {
                const arr = Array.isArray(src[key]) ? src[key] : [];
                clean.builds[tab][key] = arr
                    .filter(x => typeof x === 'string' && x.length <= 64)
                    .slice(0, LIMITS[key]);
            });
        });
        return clean;
    }).filter(c => c.gameNickname.length > 0);
}

function resolveProfileGuildId(req) {
    const fromUrl = req.params.guildId;
    if (fromUrl && fromUrl !== 'profile') return fromUrl;
    const fromQuery = req.query.guild;
    if (fromQuery && typeof fromQuery === 'string') return fromQuery;
    return 'global';
}

app.get('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const targetUserId = req.query.user || req.user.id;
    const guildId = resolveProfileGuildId(req);

    let profile = await PlayerProfile.findOne({ userId: targetUserId, guildId });
    if (!profile) profile = await PlayerProfile.findOne({ userId: targetUserId, isGlobal: true });

    if (!profile) {
        return res.json({
            _id: null,
            userId: targetUserId,
            guildId,
            isGlobal: false,
            characters: [{
                gameNickname: '', guildName: '', bio: '',
                builds: { PvE: { mysticSkills: [], innerWays: [] }, PvP: { mysticSkills: [], innerWays: [] } }
            }]
        });
    }
    res.json(profile);
});

app.post('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const guildId = resolveProfileGuildId(req);
    const { characters, isGlobal, targetUser } = req.body || {};
    const finalUserId = targetUser || req.user.id;

    // Сохранять чужой профиль может только владелец бота
    if (targetUser && targetUser !== req.user.id && req.user.id !== OWNER_ID) {
        return res.status(403).json({ error: 'Нельзя изменить чужой профиль' });
    }

    const cleanCharacters = normalizeProfileCharacters(characters);
    if (cleanCharacters.length === 0) {
        return res.status(400).json({ error: 'Нужен хотя бы один персонаж с ником' });
    }

    try {
        const profile = await PlayerProfile.findOneAndUpdate(
            { userId: finalUserId, guildId },
            { characters: cleanCharacters, isGlobal: !!isGlobal },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, profile });
    } catch (e) {
        console.error('ОШИБКА БАЗЫ:', e);
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

app.delete('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const guildId = resolveProfileGuildId(req);
    await PlayerProfile.findOneAndDelete({ userId: req.user.id, guildId });
    res.json({ success: true });
});
// ──────────────────────────────────────────────────────────────────────
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
