const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
    ReactionRole, Settings, Reminder, SentMessage, Roster, RosterConfig, RosterMessage, Log, Guide, PlayerProfile, Event, Challenge, WordleLobby, EventSettings
} = require('./models');
const { refreshRosterMessage } = require('./roster-refresh');

const OWNER_ID = '439798786059927552';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- ДОБАВИТЬ ВОТ ЭТУ СТРОКУ
app.use(session({ secret: 'super_secret_bot_key_123', resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
});

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID, clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'https://patchitos1234.fly.dev/auth/discord/callback', scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ─── MIDDLEWARE ────────────────────────────────────────────
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

async function canViewRoster(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });
        const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
        if (!member) return res.status(403).json({ error: 'Вы не на сервере' });
        const settings = await Settings.findOne({ guildId: req.params.id });
        const userGuildInfo = req.user.guilds.find(g => g.id === req.params.id);
        const isDiscordAdmin = userGuildInfo && (BigInt(userGuildInfo.permissions) & BigInt(0x8)) === BigInt(0x8);
        const isBotOwner = req.user.id === OWNER_ID;
        const isModRole = settings && settings.modRoles && member.roles.cache.some(r => settings.modRoles.includes(r.id));
        if (isBotOwner || isDiscordAdmin || isModRole) {
            req.isRosterMod = true;
            return next();
        }
        if (settings && settings.rosterRoleIds && settings.rosterRoleIds.length > 0) {
            const hasAccess = member.roles.cache.some(r => settings.rosterRoleIds.includes(r.id));
            if (hasAccess) {
                req.isRosterMod = false;
                return next();
            }
            return res.status(403).json({ error: 'Нет роли для просмотра состава' });
        }
        return res.status(403).json({ error: 'roster-role-not-configured' });
    } catch (e) {
        console.error('CAN VIEW ROSTER:', e);
        res.status(500).json({ error: 'Ошибка' });
    }
}

function ensureAuth(req, res, next) {
    if (req.user) return next();
    res.redirect('/auth/discord?returnTo=' + encodeURIComponent(req.originalUrl));
}

// ─── ХЕЛПЕРЫ ──────────────────────────────────────────────
function detectClassFromMartialArts(martialArts) {
    const map = {
        nameless_sword: 'dps', nameless_spear: 'dps', strategic_sword: 'dps',
        heavenquaker_spear: 'dps', infernal_twinblades: 'dps', mortal_rope_dart: 'dps',
        unfettered_rope_dart: 'dps', everspring_umbrella: 'dps',
        inkwell_fan: 'dps', vernal_umbrella: 'dps', ninefold_umbrella: 'dps',
        willowbend_fan: 'dps', riven_twinblades: 'dps', skystrike_gauntlets: 'dps',
        stormbreaker_spear: 'tank', thundercry_blade: 'tank',
        snowparting_blade: 'tank', phalanxbane_blade: 'tank',
        heavenwill_gauntlets: 'tank', skygrasp_rope_dart: 'tank',
        panacea_fan: 'healer', soulshade_umbrella: 'healer', musical_drum: 'healer'
    };
    const arts = (martialArts || []).filter(Boolean);
    if (arts.length === 0) return null;
    const hasDrum = arts.includes('musical_drum');
    if (hasDrum) {
        const other = arts.find(a => a !== 'musical_drum');
        if (!other) return 'healer';
        return map[other] || 'healer';
    }
    const classes = arts.map(id => map[id]).filter(Boolean);
    if (classes.length === 0) return null;
    const unique = [...new Set(classes)];
    if (unique.length === 1) return unique[0];
    return 'hybrid';
}

function getDefaultRosterColumns() {
    return [
        { key: 'dps', name: 'ДД', icon: 'dps', color: '#e74c3c', order: 0, isClass: true },
        { key: 'tank', name: 'Танк', icon: 'tank', color: '#2ecc71', order: 1, isClass: true },
        { key: 'healer', name: 'Хил', icon: 'healer', color: '#9b59b6', order: 2, isClass: true }
    ];
}

function normalizeProfileCharacters(input) {
    if (!Array.isArray(input)) return [];
    const LIMITS = { mysticSkills: 8, innerWays: 4, martialArts: 2 };
    return input.slice(0, 3).map(c => {
        const clean = {
            gameNickname: String(c && c.gameNickname || '').trim().slice(0, 64),
            guildName: String(c && c.guildName || '').trim().slice(0, 64),
            bio: String(c && c.bio || '').slice(0, 500),
            builds: { PvE: { mysticSkills: [], innerWays: [] }, PvP: { mysticSkills: [], innerWays: [] } }
        };
        ['PvE', 'PvP'].forEach(tab => {
            const src = (c && c.builds && c.builds[tab]) || {};
            ['mysticSkills', 'innerWays', 'martialArts'].forEach(key => {
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
async function updateDuelMessage(client, challengeId) {
    try {
        const challenge = await Challenge.findById(challengeId);
        if (!challenge) return;

        const challGuild = client.guilds.cache.get(challenge.challengerGuildId);
        const oppGuild = client.guilds.cache.get(challenge.opponentGuildId);
        const timeUnix = Math.floor(Number(challenge.time));

        let statusText = '⏳ Ожидает ответа';
        let color = '#f1c40f';
        if (challenge.status === 'accepted') { statusText = '✅ Вызов принят!'; color = '#2ecc71'; }
        if (challenge.status === 'declined') { statusText = '❌ Вызов отклонен'; color = '#e74c3c'; }
        if (challenge.status === 'in_progress') { statusText = '⚔️ Бои идут!'; color = '#e67e22'; }
        if (challenge.status === 'completed') { statusText = '🏆 Дуэль завершена!'; color = '#d4af37'; }

        const buildEmbed = (targetGuildId) => {
            const isOpponent = targetGuildId === challenge.opponentGuildId;
            const desc = isOpponent 
                ? `Гильдия **${challGuild?.name || '?'}** вызывает вашу гильдию!`
                : `Вы вызвали гильдию **${oppGuild?.name || '?'}** на дуэль!`;

            return new EmbedBuilder()
                .setTitle('⚔️ Вызов на Дуэль!')
                .setColor(color)
                .setDescription(desc)
                .addFields(
                    { name: '🏰 Вызывающий', value: challGuild?.name || '?', inline: true },
                    { name: '🛡️ Оппонент', value: oppGuild?.name || '?', inline: true },
                    { name: '🕒 Время', value: `<t:${timeUnix}:F> (<t:${timeUnix}:R>)`, inline: false },
                    { name: '⚔️ Формат', value: `${challenge.format} ${challenge.format == 1 ? 'бой' : 'боёв'}`, inline: true },
                    { name: '📜 Статус', value: statusText, inline: true }
                )
                .setFooter({ text: 'Открыть страницу дуэли для деталей' });
        };

        const button = new ButtonBuilder()
            .setLabel('Открыть страницу дуэли')
            .setURL('https://patchitos1234.fly.dev/duel/' + challenge._id)
            .setStyle(ButtonStyle.Link);
        const row = new ActionRowBuilder().addComponents(button);

        const oppSettings = await Settings.findOne({ guildId: challenge.opponentGuildId });
        if (oppSettings && oppSettings.challengeChannelId) {
            const oppChannel = await client.channels.fetch(oppSettings.challengeChannelId).catch(() => null);
            if (oppChannel) {
                const messages = await oppChannel.messages.fetch({ limit: 50 }).catch(() => null);
                let existingMsg = null;
                if (messages) {
                    existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].footer?.text === 'Открыть страницу дуэли для деталей' && m.components[0]?.components[0]?.url?.includes(challenge._id));
                }
                const content = challenge.status === 'pending' && oppSettings.modRoles?.length
                    ? (oppSettings.modRoles.map(id => `<@&${id}>`).join(' ') + ', вам вызов!')
                    : null;
                if (existingMsg) await existingMsg.edit({ content, embeds: [buildEmbed(challenge.opponentGuildId)], components: [row] });
                else await oppChannel.send({ content, embeds: [buildEmbed(challenge.opponentGuildId)], components: [row] });
            }
        }

        const challSettings = await Settings.findOne({ guildId: challenge.challengerGuildId });
        if (challSettings && challSettings.challengeChannelId) {
            const challChannel = await client.channels.fetch(challSettings.challengeChannelId).catch(() => null);
            if (challChannel) {
                const messages = await challChannel.messages.fetch({ limit: 50 }).catch(() => null);
                let existingMsg = null;
                if (messages) {
                    existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].footer?.text === 'Открыть страницу дуэли для деталей' && m.components[0]?.components[0]?.url?.includes(challenge._id));
                }
                let content = null;
                if (challenge.status === 'accepted') {
                    const modPings = (challSettings.modRoles || []).map(id => `<@&${id}>`).join(' ');
                    content = modPings ? `${modPings}, ваш вызов принят!` : 'Ваш вызов принят!';
                }
                if (challenge.status === 'declined') {
                    const modPings = (challSettings.modRoles || []).map(id => `<@&${id}>`).join(' ');
                    content = modPings ? `${modPings}, ваш вызов отклонили.` : 'Ваш вызов отклонили.';
                }
                if (existingMsg) await existingMsg.edit({ content, embeds: [buildEmbed(challenge.challengerGuildId)], components: [row] });
                else await challChannel.send({ content, embeds: [buildEmbed(challenge.challengerGuildId)], components: [row] });
            }
        }
    } catch (e) { console.error('UPDATE DUEL MSG:', e); }
}

// ─── AUTH ─────────────────────────────────────────────────
app.get('/auth/discord', (req, res, next) => {
    const returnTo = req.query.returnTo || '/dashboard';
    passport.authenticate('discord', { state: returnTo })(req, res, next);
});

app.get('/auth/discord/callback', (req, res, next) => {
    passport.authenticate('discord', { failureRedirect: '/' }, (err, user) => {
        if (err || !user) return res.redirect('/');
        req.logIn(user, (err) => {
            if (err) return res.redirect('/');
            const returnTo = req.query.state || '/dashboard';
            res.redirect(returnTo);
        });
    })(req, res, next);
});
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// ─── СТРАНИЦЫ ─────────────────────────────────────────────
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/manage/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild.html')); });
app.get('/guild/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild-home.html')); });
app.get('/guild/:id/roster', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'roster.html')); });
app.get('/global-profiles', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'global-profiles.html')); });
app.get('/view-profile/:userId', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'view-profile.html')); });
app.get('/duel/:id', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'duel.html')));
app.get('/guild/:id/challenges', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'challenges.html')); });
app.get('/wordle/lobby/:id', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'wordle-lobby.html')));
app.get('/wordle/game/:id', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'wordle-game.html')));
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

// ─── API ПОЛЬЗОВАТЕЛЯ ─────────────────────────────────────
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

// ─── СОБЫТИЯ ──────────────────────────────────────────────
app.get('/api/events/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const events = await Event.find({ guildId: req.params.guildId }).sort({ date: 1 });
        const fixedEvents = events.map(e => {
            const obj = e.toObject();
            // Если это старое событие без новых полей — ставим дефолт
            if (obj.isRecurring === undefined) obj.isRecurring = false;
            if (!obj.type) obj.type = 'Другое';
            if (!obj.timezoneOffset) obj.timezoneOffset = 3;
            return obj;
        });
        res.json(fixedEvents); 
    }
    catch (e) { 
        console.error('EVENTS LIST:', e); 
        res.status(500).json({ error: 'Ошибка' }); 
    }
});

app.post('/api/events/:guildId', isModerator, async (req, res) => {
    try {
        let { title, description, date, type, timezoneOffset, isRecurring, recurrenceType, recurrenceDays, timeOfDay } = req.body || {};

        if (!title) return res.status(400).json({ error: 'title обязателен' });

        // Костыль для HTML-форм: преобразуем строки в правильные типы
        const isRec = (isRecurring === 'true' || isRecurring === true);
        
        let recDays = [];
        if (typeof recurrenceDays === 'string') {
            try {
                // Пытаемся распарсить массив "[1,3,5]" из скрытого поля
                recDays = JSON.parse(recurrenceDays);
            } catch(e) {
                // Если это просто строка с числом, парсим её
                if (!isNaN(Number(recurrenceDays))) recDays = [Number(recurrenceDays)];
            }
        } else if (Array.isArray(recurrenceDays)) {
            recDays = recurrenceDays;
        }

        // Приводим дату к числу (так как из формы она приходит строкой)
        let parsedDate = Number(date);
        if (isNaN(parsedDate)) parsedDate = Date.now();

        const event = await Event.create({ 
            guildId: req.params.guildId, 
            title: title, 
            description: description || '', 
            type: type || 'Другое',
            date: parsedDate,
            timezoneOffset: Number(timezoneOffset) || 3,
            creatorId: req.user.id, 
            attendees: [],
            isRecurring: isRec,
            recurrenceType: recurrenceType || 'none',
            recurrenceDays: recDays,
            timeOfDay: timeOfDay || '20:00'
        });
        
        // Если запрос пришел от обычной HTML-формы, делаем редирект обратно на страницу
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/x-www-form-urlencoded')) {
            return res.redirect('/manage/' + req.params.guildId + '/events');
        }

        // Иначе (если запрос пришел через fetch) отдаем JSON
        res.json({ success: true, event });

    } catch (e) { 
        console.error('EVENT CREATE:', e); 
        res.status(500).json({ error: 'Ошибка: ' + e.message }); 
    }
});

app.post('/api/guild/:id/events/:eventId/join', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) return res.status(404).json({ error: 'Не найдено' });
        const userId = req.user.id;
        if (event.attendees.includes(userId)) event.attendees = event.attendees.filter(id => id !== userId);
        else event.attendees.push(userId);
        await event.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/events/:guildId/:eventId', isModerator, async (req, res) => {
    try { await Event.findByIdAndDelete(req.params.eventId); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ─── НАСТРОЙКИ СОБЫТИЙ ───────────────────────────────────
app.get('/api/guild/:id/event-settings', isModerator, async (req, res) => {
    try {
        let s = await EventSettings.findOne({ guildId: req.params.id });
        if (!s) s = await EventSettings.create({ guildId: req.params.id });
        res.json(s);
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/guild/:id/event-settings', async (req, res) => {
    try {
        const { eventChannelId, pingRoleId, timezoneOffset } = req.body;
        await EventSettings.findOneAndUpdate(
            { guildId: req.params.id },
            { eventChannelId, pingRoleId, timezoneOffset },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Ошибка сохранения' }); 
    }
});

// ─── КАНАЛЫ ДЛЯ СОБЫТИЙ ───────────────────────────────────
app.get('/api/event-channels/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });
        
        const channels = guild.channels.cache
            .filter(ch => ch.isTextBased && ch.isTextBased() && !ch.isThread() && ch.type !== 4)
            .map(ch => ({ id: ch.id, name: ch.name }));
            
        const roles = guild.roles.cache
            .filter(r => r.id !== guild.id && !r.managed && !r.name.startsWith('@'))
            .map(r => ({ id: r.id, name: r.name }));
            
        res.json({ channels, roles });
    } catch (e) { console.error('EVENT CHANNELS:', e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── ТАЙМЕР УВЕДОМЛЕНИЙ О СОБЫТИЯХ ───────────────────────
function startEventNotifier(client) {
    // Проверяем каждую минуту
    setInterval(async () => {
        try {
            const now = new Date();
            const events = await Event.find({});
            
            for (const event of events) {
                // Получаем настройки для гильдии
                const settings = await EventSettings.findOne({ guildId: event.guildId });
                if (!settings || !settings.eventChannelId) continue;

                let shouldNotify = false;
                const currentDateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

                if (event.isRecurring) {
                    // === ДЛЯ ЦИКЛИЧЕСКИХ СОБЫТИЙ ===
                    // Если уже отправляли сегодня — пропускаем
                    if (event.lastRemindedDate === currentDateStr) continue;
                    
                    // Переводим текущее время в часовой пояс события
                    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
                    const localNow = new Date(utcNow.getTime() + event.timezoneOffset * 3600000);
                    const currentHHMM = localNow.toISOString().slice(11, 16); // "HH:MM"
                    const currentDay = localNow.getDay(); // 0-6

                    if (event.timeOfDay === currentHHMM) {
                        if (event.recurrenceType === 'daily') shouldNotify = true;
                        if (event.recurrenceType === 'weekly' && event.recurrenceDays.includes(currentDay)) shouldNotify = true;
                    }
                } else {
                    // === ДЛЯ РАЗОВЫХ СОБЫТИЙ ===
                    if (!event.date) continue;
                    // Проверяем, что до начала события осталось от 0 до 2 минут
                    // (таймер проверяет раз в минуту, поэтому ловим окно в 2 минуты, чтобы не пропустить)
                    const diff = event.date - now.getTime();
                    if (diff >= 0 && diff < 120000) {
                        // Проверяем, не отправляли ли уже уведомление по этому событию
                        // (можно использовать поле lastRemindedDate, если оно есть, или проверять по времени)
                        // Для простоты считаем, что разовое событие отправляется один раз
                        shouldNotify = true;
                    }
                }

                if (!shouldNotify) continue;

                // Отправляем сообщение
                const channel = await client.channels.fetch(settings.eventChannelId).catch(() => null);
                if (!channel) continue;

                const content = settings.pingRoleId ? `<@&${settings.pingRoleId}>` : undefined;
                const typeEmoji = event.type === 'ГВГ' ? '⚔️' : (event.type === 'Арена' ? '🏟️' : '🎉');

                const embed = new EmbedBuilder()
                    .setTitle(`${typeEmoji} Событие началось: ${event.title}`)
                    .setColor('#d4af37')
                    .setDescription(event.description || 'Пора собираться!')
                    .setFooter({ text: 'Where Winds Meet • Календарь' })
                    .setTimestamp();

                await channel.send({ content, embeds: [embed] });
                
                // Если событие циклическое, запоминаем, что сегодня уже отправили
                if (event.isRecurring) {
                    event.lastRemindedDate = currentDateStr;
                    await event.save();
                } else {
                    // Для разового можно удалить его после отправки или пометить, 
                    // но пока оставим как есть, чтобы ты видел его в списке.
                }
            }
        } catch (e) {
            console.error('EVENT NOTIFIER ERROR:', e);
        }
    }, 60000); // Проверка раз в 60 секунд
}

// ─── ПРОФИЛИ ──────────────────────────────────────────────
app.get('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const targetUserId = req.query.user || req.user.id;
        const guildId = resolveProfileGuildId(req);
        let profile = await PlayerProfile.findOne({ userId: targetUserId, guildId });
        if (!profile) profile = await PlayerProfile.findOne({ userId: targetUserId, isGlobal: true });
        if (!profile) {
            return res.json({ _id: null, userId: targetUserId, guildId, isGlobal: false, characters: [{ gameNickname: '', guildName: '', bio: '', builds: { PvE: { mysticSkills: [], innerWays: [] }, PvP: { mysticSkills: [], innerWays: [] } } }] });
        }
        res.json(profile);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка базы данных' }); }
});

app.post('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const guildId = resolveProfileGuildId(req);
        const { characters, isGlobal, targetUser } = req.body || {};
        const finalUserId = targetUser || req.user.id;
        if (targetUser && targetUser !== req.user.id && req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Нельзя изменить чужой профиль' });
        const cleanCharacters = normalizeProfileCharacters(characters);
        if (cleanCharacters.length === 0) return res.status(400).json({ error: 'Нужен хотя бы один персонаж с ником' });
        const profile = await PlayerProfile.findOneAndUpdate({ userId: finalUserId, guildId }, { characters: cleanCharacters, isGlobal: !!isGlobal }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.json({ success: true, profile });
        try { refreshRosterMessage(req.app.get('botClient'), guildId); } catch (e) {}
    } catch (e) { console.error('ОШИБКА БАЗЫ:', e); res.status(500).json({ error: 'Ошибка базы данных' }); }
});

app.delete('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const guildId = resolveProfileGuildId(req);
        await PlayerProfile.findOneAndDelete({ userId: req.user.id, guildId });
        res.json({ success: true });
        try { refreshRosterMessage(req.app.get('botClient'), guildId); } catch (e) {}
    } catch (e) { res.status(500).json({ error: 'Ошибка базы данных' }); }
});

// ─── РОСТЕР ───────────────────────────────────────────────
app.get('/api/guild/:id/roster', canViewRoster, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });

        let config = await RosterConfig.findOne({ guildId: req.params.id });
        if (!config || !config.columns || config.columns.length === 0) {
            config = { columns: getDefaultRosterColumns(), manualAssignments: {} };
        }

        const members = await guild.members.fetch();
        const data = Array.from(members.values()).filter(m => !m.user.bot).map(m => ({
            id: m.id, name: m.displayName, avatar: m.user.displayAvatarURL(),
            roles: m.roles.cache.filter(r => r.id !== guild.id).map(r => r.name),
            joinedAt: m.joinedAt
        }));

        const profiles = await PlayerProfile.find({ guildId: req.params.id });
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.userId] = p; });

        res.json({ columns: config.columns, members: data, profiles: profileMap, manualAssignments: config.manualAssignments || {} });
    } catch (e) { console.error('ROSTER GET:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    try {
        const { columns, manualAssignments } = req.body;
        await RosterConfig.findOneAndUpdate(
            { guildId: req.params.id },
            { columns, manualAssignments },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/guild/:id/roster/setup', isModerator, async (req, res) => {
    try {
        const { channelId } = req.body;
        const client = req.app.get('botClient');
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Канал не найден' });
        
        const msg = await channel.send({ content: '⏳ Настройка состава...' });
        await RosterMessage.findOneAndUpdate(
            { guildId: req.params.id },
            { channelId, messageId: msg.id },
            { upsert: true }
        );
        
        try { await refreshRosterMessage(client, req.params.id); } catch (e) {}
        res.json({ success: true, messageId: msg.id });
    } catch (e) { console.error('ROSTER SETUP:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/guild/:id/roster/setup', isModerator, async (req, res) => {
    try {
        await RosterMessage.findOneAndDelete({ guildId: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ─── ПРОФИЛИ ГИЛЬДИИ ──────────────────────────────────────
app.get('/api/guild/:id/profiles', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        const profiles = await PlayerProfile.find({ $or: [ { guildId: req.params.id }, { isGlobal: true } ] });
        const enriched = await Promise.all(profiles.map(async (p) => {
            const member = await discordGuild.members.fetch(p.userId).catch(() => null);
            return { ...p._doc, discordName: member ? member.user.username : 'Неизвестный', avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png` };
        }));
        res.json(enriched);
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/guild/:id/profiles/:userId', isModerator, async (req, res) => {
    try { await PlayerProfile.findOneAndDelete({ userId: req.params.userId, guildId: req.params.id }); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/guild/:id/profiles-public', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });
        const raw = await PlayerProfile.find({ $or: [ { guildId: req.params.id }, { isGlobal: true } ] });
        const local = raw.filter(p => p.guildId === req.params.id || discordGuild.members.cache.has(p.userId));
        const enriched = await Promise.all(local.map(async (p) => {
            const member = await discordGuild.members.fetch(p.userId).catch(() => null);
            return { _id: p._id, userId: p.userId, guildId: p.guildId, isGlobal: p.isGlobal, characters: p.characters, discordName: member ? member.user.username : 'Неизвестный', avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png` };
        }));
        res.json({ local: enriched, global: [] });
    } catch (e) { res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});

app.get('/api/guilds-list', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        res.json(client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null })));
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/profiles-global', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const filterGuild = req.query.guild || 'all';
        const filterMartial = req.query.martial || 'all';
        const allGlobal = await PlayerProfile.find({ isGlobal: true });
        const botGuildIds = client.guilds.cache.map(g => g.id);
        const relevant = allGlobal.filter(p => botGuildIds.includes(p.guildId));
        const enriched = await Promise.all(relevant.map(async (p) => {
            const discordGuild = client.guilds.cache.get(p.guildId);
            const member = discordGuild ? await discordGuild.members.fetch(p.userId).catch(() => null) : null;
            return { _id: p._id, userId: p.userId, guildId: p.guildId, guildName: discordGuild ? discordGuild.name : 'Неизвестная гильдия', isGlobal: p.isGlobal, characters: p.characters, discordName: member ? member.user.username : 'Неизвестный', avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`, inGuild: !!member };
        }));
        let filtered = enriched;
        if (filterGuild && filterGuild !== 'all') filtered = filtered.filter(p => p.guildId === filterGuild);
        if (filterMartial && filterMartial !== 'all') {
            filtered = filtered.filter(p => (p.characters || []).some(c => {
                const pve = (c.builds && c.builds.PvE && c.builds.PvE.martialArts) || [];
                const pvp = (c.builds && c.builds.PvP && c.builds.PvP.martialArts) || [];
                return pve.includes(filterMartial) || pvp.includes(filterMartial);
            }));
        }
        filtered.sort((a, b) => a.discordName.localeCompare(b.discordName));
        res.json(filtered);
    } catch (e) { res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});

// ─── ДУЭЛИ ────────────────────────────────────────────────
app.get('/api/duel/:id', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Вызов не найден' });
        const client = req.app.get('botClient');
        const challengerGuild = client.guilds.cache.get(challenge.challengerGuildId);
        const opponentGuild = client.guilds.cache.get(challenge.opponentGuildId);
        const isChallengerMod = await (async () => {
            if (req.user.id === OWNER_ID) return true;
            const g = req.user.guilds.find(gi => gi.id === challenge.challengerGuildId);
            if (g && (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) return true;
            const s = await Settings.findOne({ guildId: challenge.challengerGuildId });
            if (s && s.modRoles) {
                const m = await challengerGuild.members.fetch(req.user.id).catch(() => null);
                if (m && m.roles.cache.some(r => s.modRoles.includes(r.id))) return true;
            }
            return false;
        })();
        const isOpponentMod = await (async () => {
            if (req.user.id === OWNER_ID) return true;
            const g = req.user.guilds.find(gi => gi.id === challenge.opponentGuildId);
            if (g && (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) return true;
            const s = await Settings.findOne({ guildId: challenge.opponentGuildId });
            if (s && s.modRoles) {
                const m = await opponentGuild.members.fetch(req.user.id).catch(() => null);
                if (m && m.roles.cache.some(r => s.modRoles.includes(r.id))) return true;
            }
            return false;
        })();
        res.json({ challenge, challengerGuild: { id: challengerGuild?.id, name: challengerGuild?.name || 'Неизвестно', icon: challengerGuild?.icon }, opponentGuild: { id: opponentGuild?.id, name: opponentGuild?.name || 'Неизвестно', icon: opponentGuild?.icon }, canManageChallenger: isChallengerMod, canManageOpponent: isOpponentMod });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/guild/:id/challenges', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const challenges = await Challenge.find({ $or: [{ challengerGuildId: req.params.id }, { opponentGuildId: req.params.id }] }).sort({ time: -1 }).limit(10);
        const client = req.app.get('botClient');
        const enriched = await Promise.all(challenges.map(async ch => {
            const chGuild = client.guilds.cache.get(ch.challengerGuildId);
            const oppGuild = client.guilds.cache.get(ch.opponentGuildId);
            return { _id: ch._id, time: ch.time, format: ch.format, status: ch.status, challengerName: chGuild?.name || 'Неизвестно', opponentName: oppGuild?.name || 'Неизвестно' };
        }));
        res.json(enriched);
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/duel/:id/accept', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        challenge.status = 'accepted';
        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/duel/:id/decline', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        challenge.status = 'declined';
        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/duel/:id/set-player', ensureAuth, async (req, res) => {
    try {
        const { matchIndex, side, userId, name } = req.body;
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        if (challenge.status !== 'accepted' && challenge.status !== 'in_progress') return res.status(400).json({ error: 'Сначала примите вызов' });
        const client = req.app.get('botClient');
        const guildId = side === 'challenger' ? challenge.challengerGuildId : challenge.opponentGuildId;
        const discordGuild = client.guilds.cache.get(guildId);
        let isMod = false;
        if (req.user.id === OWNER_ID) isMod = true;
        else if (discordGuild) {
            const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
            if (member) {
                const settings = await Settings.findOne({ guildId });
                const userGuildInfo = req.user.guilds.find(g => g.id === guildId);
                const isDiscordAdmin = userGuildInfo && (BigInt(userGuildInfo.permissions) & BigInt(0x8)) === BigInt(0x8);
                const isModRole = settings && settings.modRoles && member.roles.cache.some(r => settings.modRoles.includes(r.id));
                if (isDiscordAdmin || isModRole) isMod = true;
            }
        }
        if (!isMod) return res.status(403).json({ error: 'Вы не модератор этой гильдии' });
        const match = challenge.matches.find(m => m.matchIndex === Number(matchIndex));
        if (!match) return res.status(400).json({ error: 'Матч не найден' });
        if (side === 'challenger') match.challengerPlayer = { userId, name };
        else if (side === 'opponent') match.opponentPlayer = { userId, name };
        challenge.markModified('matches');
        await challenge.save();
        res.json({ success: true, matches: challenge.matches });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/duel/:id/start', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        const allFilled = challenge.matches.every(m => m.challengerPlayer && m.opponentPlayer);
        if (!allFilled) return res.status(400).json({ error: 'Не все матчи заполнены.' });
        challenge.status = 'in_progress';
        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/duel/:id/set-winner', ensureAuth, async (req, res) => {
    try {
        const { matchIndex, winnerSide } = req.body;
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        if (challenge.status !== 'in_progress') return res.status(400).json({ error: 'Бои еще не начались' });
        const match = challenge.matches.find(m => m.matchIndex === Number(matchIndex));
        if (!match) return res.status(400).json({ error: 'Матч не найден' });
        match.winner = winnerSide;
        challenge.markModified('matches');
        const totalMatches = challenge.matches.length;
        const finishedMatches = challenge.matches.filter(m => m.winner !== null).length;
        if (finishedMatches === totalMatches) {
            challenge.status = 'completed';
            const chWins = challenge.matches.filter(m => m.winner === 'challenger').length;
            const oppWins = challenge.matches.filter(m => m.winner === 'opponent').length;
            if (chWins > oppWins) challenge.winnerGuildId = challenge.challengerGuildId;
            else if (oppWins > chWins) challenge.winnerGuildId = challenge.opponentGuildId;
        }
        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        res.json({ success: true, status: challenge.status, matches: challenge.matches, winnerGuildId: challenge.winnerGuildId });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/duel/:id', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        await Challenge.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/guild/:id/challenge', isModerator, async (req, res) => {
    try {
        const { opponentGuildId, time, format } = req.body || {};
        const challengerGuildId = req.params.id;
        if (!opponentGuildId || !time || !format) return res.status(400).json({ error: 'Не все поля заполнены' });
        if (opponentGuildId === challengerGuildId) return res.status(400).json({ error: 'Нельзя вызвать свою же гильдию' });
        const client = req.app.get('botClient');
        const opponentGuild = client.guilds.cache.get(opponentGuildId);
        if (!opponentGuild) return res.status(404).json({ error: 'Гильдия-оппонент не найдена' });
        const oppSettings = await Settings.findOne({ guildId: opponentGuildId });
        if (!oppSettings || !oppSettings.challengeChannelId) return res.status(400).json({ error: 'Оппонент не настроил канал для вызовов' });
        const numMatches = parseInt(format) || 1;
        const matches = Array.from({ length: numMatches }).map((_, i) => ({ matchIndex: i + 1, challengerPlayer: null, opponentPlayer: null, winner: null }));
        const challenge = await Challenge.create({ challengerGuildId, opponentGuildId, time: Number(time), format: numMatches, status: 'pending', channelId: oppSettings.challengeChannelId, matches });
        res.json({ success: true, challengeId: challenge._id });
    } catch (e) { res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});

// ─── ГАЙДЫ ────────────────────────────────────────────────
app.get('/api/guild/:id/guides', isModerator, async (req, res) => {
    try { res.json(await Guide.find({ guildId: req.params.id }).sort({ date: -1 })); }
    catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try {
        if (req.params.guideId === 'new') return res.json({ name: '', description: '', chapters: [] });
        if (!req.params.guideId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Неверный формат ID' });
        const guide = await Guide.findById(req.params.guideId);
        if (!guide) return res.status(404).json({ error: 'Не найден' });
        res.json(guide);
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/guild/:id/guides', isModerator, async (req, res) => {
    try { const guide = await Guide.create({ guildId: req.params.id, ...req.body }); res.json({ success: true, guideId: guide._id }); }
    catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try {
        if (!req.params.guideId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Неверный ID' });
        await Guide.findByIdAndUpdate(req.params.guideId, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try {
        if (!req.params.guideId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error: 'Неверный ID' });
        await Guide.findByIdAndDelete(req.params.guideId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ─── WORDLE (СВИТОК ИЕРОГЛИФОВ) ───────────────────────────
const RAW_WORDLE_DICTS = {
    4: ['ИГРА', 'ГОРА', 'РЕКА', 'ЛУНА', 'ВОДА', 'ЛИСТ', 'РЫБА', 'ВОЛК', 'ЛИСА', 'ЗМЕЯ', 'ЩИТ', 'ХРАМ', 'МОСТ', 'СВЕТ', 'ТЕНЬ', 'НОЧЬ', 'ДЕНЬ', 'УТРО', 'ПУТЬ', 'ЛЕС', 'ПОЛЕ', 'САД', 'ЧАЙ', 'РИС', 'ХЛЕБ', 'СУП', 'МЯСО', 'ГРИБ', 'МЕЧ', 'БУРЯ', 'ЦВЕТ', 'ПЛОД', 'СЕМЯ', 'ЧАША', 'ПЕЧЬ', 'ПЛОТ', 'МОРЕ', 'ПОРТ', 'ЯШМА', 'АГАТ', 'ЛЕТО', 'ЗИМА', 'МОРОЗ', 'ГРОМ', 'СИЛА', 'БАЗА', 'БРАТ', 'ВРАГ', 'ДВОР', 'ДЕЛО', 'ДИСК', 'ДУША', 'ЗВУК', 'ЗНАК', 'ИДЕЯ', 'КАДР', 'КЛУБ', 'КЛЮЧ', 'КОНЬ', 'КРАЙ', 'КРУГ', 'ЛУЧ', 'МАГ', 'МИР', 'МУЖ', 'МЯЧ', 'НОС', 'ОКНО', 'ОРЕЛ', 'ПЕС', 'ПЛАН', 'РАЙ', 'РАК', 'РОГ', 'РОД', 'РОТ', 'СЛОН', 'СМЕХ', 'СНЕГ', 'СОК', 'СОЛЬ', 'СОН', 'СЫР', 'ТИГР', 'ТОРТ', 'ТРУД', 'УГОЛ', 'УДАР', 'УРОК', 'ФАКТ', 'ФЛАГ', 'ХОЛМ', 'ШАР', 'ШКАФ', 'ШЛЕМ', 'ШУМ', 'ЭТАЖ', 'ЮМОР', 'ЯЗЫК', 'ЯМА'],
    5: ['АВТОР', 'АДРЕС', 'АКТЕР', 'АЛЛЕЯ', 'АЛМАЗ', 'АРБУЗ', 'АРЕНА', 'АРМИЯ', 'АРХИВ', 'АТАКА', 'АТЛЕТ', 'АФИША', 'БАГАЖ', 'БАЗАР', 'БАЛЕТ', 'БАНАН', 'БАНДА', 'БАРОН', 'БАШНЯ', 'БЕРЕГ', 'БЕТОН', 'БИЛЕТ', 'БИТВА', 'БЛЮДО', 'БОКАЛ', 'БОМБА', 'БОЧКА', 'БРОНЯ', 'БУКВА', 'БУКЕТ', 'БУЛКА', 'ВАГОН', 'ВАЛЬС', 'ВАННА', 'ВЕДРО', 'ВЕНИК', 'ВЕНОК', 'ВЕСЛО', 'ВЕСНА', 'ВЕТЕР', 'ВЕТКА', 'ВЕЧЕР', 'ВЗГЛЯД', 'ВЗРЫВ', 'ВИЛКА', 'ВИРУС', 'ВИШНЯ', 'ВКУС', 'ВОЖДЬ', 'ВОЙНА', 'ВОЛОС', 'ВОПРОС', 'ВОРОН', 'ВОРОТ', 'ВРЕМЯ', 'ВЫБОР', 'ВЫВОД', 'ВЫЗОВ', 'ГАЗОН', 'ГАРАЖ', 'ГЕНИЙ', 'ГЕРОЙ', 'ГЛИНА', 'ГОЛОС', 'ГОРОД', 'ГОРОХ', 'ГОСТЬ', 'ГРАНЬ', 'ГРОЗА', 'ГРУДЬ', 'ГРУЗ', 'ГРУША', 'ДВЕРЬ', 'ДИВАН', 'ДОЖДЬ', 'ДОСКА', 'ДРАКА', 'ДРОБЬ', 'ДЫНЯ', 'ЖАКЕТ', 'ЖЕЗЛ', 'ЖИВОТ', 'ЖИЛЕТ', 'ЗАБОР', 'ЗАВОД', 'ЗАКАТ', 'ЗАКОН', 'ЗАЛИВ', 'ЗАМОК', 'ЗАПАД', 'ЗАПАХ', 'ЗАРЯД', 'ЗВЕРЬ', 'ЗЕРНО', 'ЗОНТ', 'ИЗБА', 'ИСКРА', 'ИТОГ', 'КАБАН', 'КАМИН', 'КАНАЛ', 'КАНАТ', 'КАРТА', 'КАТЕР', 'КВАРЦ', 'КИСТЬ', 'КЛАСС', 'КОЖА', 'КОЗЕЛ', 'КОМАР', 'КОМОД', 'КОНЕЦ', 'КОРОБ', 'КОСТЬ', 'КОШКА', 'КРАН', 'КРЕСТ', 'КРИК', 'КРУПА', 'КРЫЛО', 'КРЫША', 'КРЮК', 'КУБИК', 'КУКЛА', 'КУЛАК', 'КУПОЛ', 'КУРС', 'КУСТ', 'КУХНЯ', 'ЛАВКА', 'ЛАМПА', 'ЛАПША', 'ЛАСКА', 'ЛЕЙКА', 'ЛЕНТА', 'ЛЕСКА', 'ЛИМОН', 'ЛИНИЯ', 'ЛИТР', 'ЛИФТ', 'ЛИЦО', 'ЛОЖКА', 'ЛОСЬ', 'ЛУЖА', 'ЛУПА', 'ЛЫЖИ', 'МАГИЯ', 'МАЙКА', 'МАСКА', 'МАСЛО', 'МАТЧ', 'МЕЛ', 'МЕРА', 'МЕСТО', 'МЕСЯЦ', 'МЕТЛА', 'МИНА', 'МИСКА', 'МОЛОТ', 'МОРЖ', 'МОТИВ', 'МОТОР', 'МУЗЕЙ', 'МУКА', 'МУХА', 'МЫЛО', 'МЫШЬ', 'НАБЕГ', 'НАВЕС', 'НАВЫК', 'НАЛОГ', 'НАМЕК', 'НАРОД', 'НАРЯД', 'НАСОС', 'НАУКА', 'НЕБО', 'НЕВОД', 'НЕФТЬ', 'НИТЬ', 'НИША', 'НОМЕР', 'НОРА', 'НОРМА', 'НОСОК', 'НОТА', 'ОБЕД', 'ОБИДА', 'ОБМАН', 'ОБМЕН', 'ОБРАЗ', 'ОБУВЬ', 'ОВЕС', 'ОВОД', 'ОВОЩ', 'ОВЦА', 'ОЖОГ', 'ОЗЕРО', 'ОКЕАН', 'ОКОП', 'ОЛЕНЬ', 'ОРЕХ', 'ОРДЕН', 'ОСЕНЬ', 'ОСИНА', 'ОТВЕТ', 'ОТДЫХ', 'ОТЕЦ', 'ОТКАЗ', 'ОТЧЕТ', 'ОФИС', 'ОХОТА', 'ОЧАГ', 'ОЧКИ', 'ПАЛЕЦ', 'ПАЛКА', 'ПАПКА', 'ПАРАД', 'ПАРОМ', 'ПАРУС', 'ПАСТА', 'ПАУЗА', 'ПАУК', 'ПЕНАЛ', 'ПЕПЕЛ', 'ПЕРЕЦ', 'ПЕРО', 'ПЕСНЯ', 'ПЕСОК', 'ПЕТУХ', 'ПИЛА', 'ПИЛОТ', 'ПИРОГ', 'ПИЩА', 'ПЛАМЯ', 'ПЛАН', 'ПЛАТА', 'ПЛАЩ', 'ПЛЕЧО', 'ПЛОВ', 'ПЛУГ', 'ПОБЕГ', 'ПОВАР', 'ПОВОД', 'ПОЕЗД', 'ПОЖАР', 'ПОЗА', 'ПОИСК', 'ПОКОЙ', 'ПОЛЕТ', 'ПОЛК', 'ПОЛКА', 'ПОЛЮС', 'ПОНИ', 'ПОРОГ', 'ПОРОХ', 'ПОСОЛ', 'ПОСОХ', 'ПОТОК', 'ПОХОД', 'ПОЧВА', 'ПОЭТ', 'ПОЯС', 'ПРАВО', 'ПРАХ', 'ПРИЗ', 'ПРУД', 'ПУДРА', 'ПУЛЬС', 'ПУНКТ', 'ПЧЕЛА', 'ПШЕНО', 'ПЯТНО', 'РАДАР', 'РАДИО', 'РАМА', 'РАНА', 'РАНЕЦ', 'РАСА', 'РЕБРО', 'РЕЖИМ', 'РЕЙД', 'РЕЛЬС', 'РЕПА', 'РЕЧЬ', 'РИТМ', 'РОБОТ', 'РОЗА', 'РОМАН', 'РОСА', 'РОСТ', 'РОЩА', 'РУБЛЬ', 'РУДА', 'РУКАВ', 'РУЛЬ', 'РУЧЕЙ', 'РУЧКА', 'РЫНОК', 'РЫСЬ', 'РЮМКА', 'САЖА', 'САЛАТ', 'САЛОН', 'САЛЮТ', 'САПОГ', 'САХАР', 'СБОР', 'СВЕЧА', 'СВИСТ', 'СВЯЗЬ', 'СЕАНС', 'СЕВЕР', 'СЕДЛО', 'СЕЗОН', 'СЕЛО', 'СЕМЬЯ', 'СЕНО', 'СЕРИЯ', 'СЕТКА', 'СИРОП', 'СИТО', 'СКАЛА', 'СКАТ', 'СКВЕР', 'СКЛАД', 'СКЛОН', 'СКОТ', 'СЛАВА', 'СЛЕД', 'СЛЕЗА', 'СЛИВА', 'СЛОВО', 'СЛУГА', 'СМЕНА', 'СМЕСЬ', 'СМОЛА', 'СМЫСЛ', 'СОВЕТ', 'СОКОЛ', 'СОРТ', 'СОСЕД', 'СОСНА', 'СОТНЯ', 'СОУС', 'СОЮЗ', 'СПИНА', 'СПИРТ', 'СПОРТ', 'СПРОС', 'СРЕДА', 'ССОРА', 'СТАДО', 'СТАЛЬ', 'СТВОЛ', 'СТЕНА', 'СТЕПЬ', 'СТИЛЬ', 'СТОЛБ', 'СТОН', 'СТРАХ', 'СТРУЯ', 'СТУЛ', 'СТЫД', 'СУКНО', 'СУМКА', 'СУТКИ', 'СФЕРА', 'СХЕМА', 'СЦЕНА', 'СЧЕТ', 'ТАБАК', 'ТАЙНА', 'ТАКСИ', 'ТАКТ', 'ТАНЕЦ', 'ТАНК', 'ТАРИФ', 'ТАЧКА', 'ТЕАТР', 'ТЕКСТ', 'ТЕЛО', 'ТЕМА', 'ТЕПЛО', 'ТЕСТО', 'ТКАНЬ', 'ТОВАР', 'ТОЛПА', 'ТОПОР', 'ТОСКА', 'ТОЧКА', 'ТРАВА', 'ТРУБА', 'ТУМАН', 'ТУЧА', 'ТУША', 'ТЫКВА', 'УГОЛЬ', 'УДАЧА', 'УЖИН', 'УЗЕЛ', 'УЗОР', 'УКАЗ', 'УЛИЦА', 'УРОН', 'УСПЕХ', 'УТЕС', 'ФАКЕЛ', 'ФАРШ', 'ФАСАД', 'ФИЛИН', 'ФИЛЬМ', 'ФИНАЛ', 'ФИНИШ', 'ФИРМА', 'ФЛОТ', 'ФОКУС', 'ФОНД', 'ФОРМА', 'ФОТО', 'ФРАЗА', 'ФРОНТ', 'ФРУКТ', 'ХАЛАТ', 'ХВОСТ', 'ХОЛМ', 'ХОЛОД', 'ХОРЕК', 'ЦАРЬ', 'ЦВЕТ', 'ЦЕЛЬ', 'ЦЕНТР', 'ЦЕПЬ', 'ЦИКЛ', 'ЦИРК', 'ЦИФРА', 'ЧАСТЬ', 'ЧАСЫ', 'ЧАШКА', 'ЧЕК', 'ЧЕРЕП', 'ЧЕРТА', 'ЧЕСТЬ', 'ЧИСЛО', 'ЧЛЕН', 'ЧУДО', 'ШАПКА', 'ШАРИК', 'ШАТЕР', 'ШАХТА', 'ШЕЛК', 'ШЕПОТ', 'ШЕСТ', 'ШИНА', 'ШКУРА', 'ШЛЯПА', 'ШПАГА', 'ШРАМ', 'ШТАБ', 'ШТОРА', 'ШТРАФ', 'ШТУКА', 'ШТУРМ', 'ШТЫК', 'ШУБА', 'ШУТКА', 'ЩЕКА', 'ЩЕЛЬ', 'ЩЕТКА', 'ЩУКА', 'ЭКРАН', 'ЭТАП', 'ЭФИР', 'ЮБКА', 'ЮНОША', 'ЯГОДА', 'ЯДРО', 'ЯЙЦО', 'ЯКОРЬ', 'ЯРУС', 'ЯХТА', 'ЯЩИК'],
    6: ['АНАНАС', 'АПТЕКА', 'АРТИСТ', 'БАНКЕТ', 'БАРЬЕР', 'БЕГЛЕЦ', 'БЕЗДНА', 'БЕСЕДА', 'БИБЛИО', 'БИЗНЕС', 'БОЛОТО', 'БОРОДА', 'БРЕВНО', 'БУМАГА', 'ВЕКТОР', 'ВОЗДУХ', 'ВОКЗАЛ', 'ГАЗЕТА', 'ГВОЗДЬ', 'ГОЛУБЬ', 'ГРАДУС', 'ГРАФИК', 'ДВОРЕЦ', 'ДОКЛАД', 'ДОКТОР', 'ДОРОГА', 'ЖЕЛЕЗО', 'ЖЕРТВА', 'ЖУРНАЛ', 'ЗАСУХА', 'ЗАХВАТ', 'ЗАЩИТА', 'ЗДАНИЕ', 'ЗИГЗАГ', 'ЗРАЧОК', 'КАБЕЛЬ', 'КАБЛУК', 'КАДИЛО', 'КАЛЕКА', 'КАЛИНА', 'КАМЕНЬ', 'КАПКАН', 'КАРАСЬ', 'КАРМАН', 'КАФТАН', 'КАЧЕЛИ', 'КИЛЬКА', 'КИСЕЛЬ', 'КИТЕЛЬ', 'КЛЕТКА', 'КЛИНОК', 'КЛУБОК', 'КЛЯКСА', 'КНОПКА', 'КОЛДУН', 'КОЛЕСО', 'КОЛЬЦО', 'КОМПАС', 'КОПЫТО', 'КОРЕНЬ', 'КОРОЛЬ', 'КОРПУС', 'КОСМОС', 'КОСТЕР', 'КОСТЮМ', 'КРАСКА', 'КРАТЕР', 'КРЕДИТ', 'КРИЗИС', 'КРОЛИК', 'КУВШИН', 'КУРИЦА', 'КУРТКА', 'ЛАГЕРЬ', 'ЛАДОНЬ', 'ЛАНДЫШ', 'ЛАСТИК', 'ЛАЧУГА', 'ЛЕБЕДЬ', 'ЛЕЗВИЕ', 'ЛЕКЦИЯ', 'ЛИВЕНЬ', 'ЛОГОВО', 'ЛОКОТЬ', 'ЛОПАТА', 'ЛОШАДЬ', 'ЛЮБОВЬ', 'ЛЮСТРА', 'МАГНИЙ', 'МАЛИНА', 'МАМОНТ', 'МАТРАС', 'МАШИНА', 'МЕДАЛЬ', 'МЕТАЛЛ', 'МЕТЕЛЬ', 'МОЛОКО', 'МУНДИР', 'НАТИСК', 'НАЧАЛО', 'ОБЛАКО', 'ОБЪЕКТ', 'ОГОРОД', 'ОГРАДА', 'ОГУРЕЦ', 'ОДЕЖДА', 'ОДЕЯЛО', 'ОСКОЛОК', 'ОСНОВА', 'ОСТРОВ', 'ОТМЕЛЬ', 'ОТПУСК', 'ОШИБКА', 'ПАЛУБА', 'ПАМЯТЬ', 'ПАНЕЛЬ', 'ПАСЕКА', 'ПЕЙЗАЖ', 'ПЕНАЛ', 'ПЕЧАТЬ', 'ПЕЧЕНЬ', 'ПЕЩЕРА', 'ПИДЖАК', 'ПИСЬМО', 'ПЛАТЬЕ', 'ПОГОДА', 'ПОМОЩЬ', 'ПОРТАЛ', 'ПРИКАЗ', 'ПРОВОД', 'ПРОЕКТ', 'ПРОРЫВ', 'ПРЫЖОК', 'РАБОТА', 'РАКЕТА', 'РЕЗЕРВ', 'РЕКОРД', 'РЕЛЬЕФ', 'РЕМЕНЬ', 'РЕЦЕПТ', 'РОДНИК', 'РОЗЫСК', 'РУГАНЬ', 'РЮКЗАК', 'СДЕЛКА', 'СЕКРЕТ', 'СЕКТОР', 'СЕРДЦЕ', 'СЕРВИЗ', 'СИГНАЛ', 'СИЛУЭТ', 'СИМВОЛ', 'СКАЗКА', 'СКИДКА', 'СЛУЧАЙ', 'СНОСКА', 'СОБАКА', 'СОЛДАТ', 'СОЛНЦЕ', 'СПИСОК', 'СПОСОБ', 'СТАКАН', 'СТАРИК', 'СТАТЬЯ', 'СТАТУЯ', 'СТЕКЛО', 'СТОРОЖ', 'СТРАЖА', 'СТРАНА', 'СТРЕЛА', 'СТРЕСС', 'СТРОКА', 'СТУДИЯ', 'СУДЬБА', 'СУСТАВ', 'ТАЛАНТ', 'ТАМБУР', 'ТВОРОГ', 'ТЕЛЕГА', 'ТЕОРИЯ', 'ТЕРМИН', 'ТЕРМОС', 'ТИШИНА', 'ТУНДРА', 'ТЮЛЕНЬ', 'ТЮРЬМА', 'УБОРКА', 'УБЫТОК', 'УЛЫБКА', 'УМЕНИЕ', 'УНИКУМ', 'УНИСОН', 'УПАДОК', 'УПРАВА', 'УРОЖАЙ', 'ФАСОЛЬ', 'ФИАЛКА', 'ФИГУРА', 'ФИЗИКА', 'ФОНАРЬ', 'ФОНТАН', 'ФУТБОЛ', 'ФУТЛЯР', 'ХИЖИНА', 'ХИРУРГ', 'ХЛОПОК', 'ХОЗЯИН', 'ХРЕБЕТ', 'ЦВЕТОК', 'ЦЕМЕНТ', 'ЧЕРВЯК', 'ЧЕСНОК', 'ЧТЕНИЕ', 'ЧУДЕСА', 'ШЕДЕВР', 'ШЕРСТЬ', 'ШИНЕЛЬ', 'ШИРИНА', 'ШЛЮПКА', 'ЭКИПАЖ', 'ЭТИКЕТ', 'ЯБЛОКО', 'ЯНВАРЬ', 'ЯЧМЕНЬ'],
    7: ['АЛТАРЬ', 'БИБЛИОТЕКА', 'ВОЗДУШНЫЙ', 'ВОЗРОЖДЕНИЕ', 'ВОСХИЩЕНИЕ', 'ВПЕЧАТЛЕНИЕ', 'ВЫРАЖЕНИЕ', 'ГОЛОВОЛОМКА', 'ГОРОЖАНИН', 'ГОТОВНОСТЬ', 'ДВИЖЕНИЕ', 'ДОСТИЖЕНИЕ', 'ЖИВОПИСЬ', 'ЗАВЕРШЕНИЕ', 'ЗАВИСТЬ', 'ЗАГАДКА', 'ЗАДАНИЕ', 'ЗАЩИТНИК', 'ЗДОРОВЬЕ', 'ЗЕРКАЛО', 'ИЗУМРУД', 'ИМПЕРАТОР', 'ИСКУССТВО', 'ИСПЫТАНИЕ', 'ИСЦЕЛЕНИЕ', 'КОЛДОВСТВО', 'КОМАНДИР', 'КОМНАТА', 'КОНВЕРТ', 'КОНТРОЛЬ', 'КОРАБЛЬ', 'КОРОЛЕВА', 'КРАСОТА', 'КРЕПОСТЬ', 'КРИСТАЛЛ', 'ЛАБИРИНТ', 'ЛЕГЕНДА', 'ЛЕОПАРД', 'ЛЕСТНИЦА', 'ЛИТЕРАТУРА', 'МАСТЕРСТВО', 'МЕДВЕДЬ', 'МЕЛОДИЯ', 'МИЛОСЕРДИЕ', 'МОГУЩЕСТВО', 'МОЛОДОСТЬ', 'МОНАСТЫРЬ', 'МОТИВАЦИЯ', 'МУДРОСТЬ', 'НАПРАВЛЕНИЕ', 'НАСЛЕДИЕ', 'НАСТАВНИК', 'НАСТРОЕНИЕ', 'ОБОРУДОВАНИЕ', 'ОБУЧЕНИЕ', 'ОЗАРЕНИЕ', 'ОКРУЖЕНИЕ', 'ОПАСНОСТЬ', 'ОРУЖИЕ', 'ОТКРОВЕНИЕ', 'ОТНОШЕНИЕ', 'ОХРАННИК', 'ПАМЯТНИК', 'ПЕРЕВАЛ', 'ПЕРЕМЕНА', 'ПЕРЕХОД', 'ПОБЕДИТЕЛЬ', 'ПОВЕДЕНИЕ', 'ПОДВИГ', 'ПОЗНАНИЕ', 'ПОКЛОНЕНИЕ', 'ПОЛКОВОДЕЦ', 'ПОМЕЩЕНИЕ', 'ПОНИМАНИЕ', 'ПОРОЖДЕНИЕ', 'ПОСВЯЩЕНИЕ', 'ПОСЛЕДСТВИЕ', 'ПОСТРОЕНИЕ', 'ПОТЕРЯ', 'ПРАВИТЕЛЬ', 'ПРАЗДНИК', 'ПРЕВРАЩЕНИЕ', 'ПРЕДМЕТ', 'ПРЕДСКАЗАНИЕ', 'ПРЕКРАСНОЕ', 'ПРЕОДОЛЕНИЕ', 'ПРЕПЯТСТВИЕ', 'ПРИЗВАНИЕ', 'ПРИКЛЮЧЕНИЕ', 'ПРИНЦИП', 'ПРОДОЛЖЕНИЕ', 'ПРОИСШЕСТВИЕ', 'ПРОСВЕТЛЕНИЕ', 'ПРОСТРАНСТВО', 'ПРОЦВЕТАНИЕ', 'ПРОЦЕСС', 'ПУТЕШЕСТВИЕ', 'РАВНОВЕСИЕ', 'РАЗВИТИЕ', 'РАЗУМ', 'РАССВЕТ', 'РАССТОЯНИЕ', 'РАСТЕНИЕ', 'РЕШЕНИЕ', 'РИТУАЛ', 'СВИДАНИЕ', 'СВОБОДА', 'СЕРЕДИНА', 'СИЯНИЕ', 'СКАЗАНИЕ', 'СЛУЖЕНИЕ', 'СМЕЛОСТЬ', 'СОБРАНИЕ', 'СОЗНАНИЕ', 'СОКРОВИЩЕ', 'СООРУЖЕНИЕ', 'СОСТОЯНИЕ', 'СПАСЕНИЕ', 'СПОКОЙСТВИЕ', 'СТРАНСТВИЕ', 'СТРЕМЛЕНИЕ', 'СУЩЕСТВО', 'ТАЙНИК', 'ТВОРЧЕСТВО', 'ТЕРПЕНИЕ', 'ТОРЖЕСТВО', 'ТРАДИЦИЯ', 'УВАЖЕНИЕ', 'УДИВЛЕНИЕ', 'УКРАШЕНИЕ', 'УПРАВЛЕНИЕ', 'УСИЛИЕ', 'УСТРОЙСТВО', 'УЧЕНИК', 'УЧИЛИЩЕ', 'ФАНТАЗИЯ', 'ХАРАКТЕР', 'ХРАБРОСТЬ', 'ХРАНИТЕЛЬ', 'ЦЕЛИТЕЛЬ', 'ЦЕРЕМОНИЯ', 'ЧУВСТВО', 'ЧУДОВИЩЕ', 'ЭНЕРГИЯ']
};

let ALLOWED_WORDS = null;
function initWordleDictionary() {
    const dict = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };
    const dictPath = path.join(__dirname, 'data', 'russian_nouns.txt');
    try {
        if (fs.existsSync(dictPath)) {
            const raw = fs.readFileSync(dictPath, 'utf8');
            const words = raw.split(/\r?\n/).map(w => w.trim().toUpperCase().replace(/Ё/g, 'Е')).filter(w => /^[А-Я]+$/.test(w));
            for (const len of [4, 5, 6, 7]) {
                for (const w of words) { if (w.length === len) dict[len].add(w); }
                RAW_WORDLE_DICTS[len].forEach(w => dict[len].add(w.toUpperCase().replace(/Ё/g, 'Е')));
            }
            console.log('📚 Словарь Wordle загружен.');
        } else {
            for (const len of [4, 5, 6, 7]) { RAW_WORDLE_DICTS[len].forEach(w => dict[len].add(w)); }
        }
    } catch (e) {
        console.error('❌ Ошибка словаря:', e.message);
        for (const len of [4, 5, 6, 7]) { RAW_WORDLE_DICTS[len].forEach(w => dict[len].add(w)); }
    }
    ALLOWED_WORDS = dict;
}
initWordleDictionary();

function getRandomWordleWord(length) {
    const dict = ALLOWED_WORDS[length];
    const wordsArray = Array.from(dict);
    return wordsArray[Math.floor(Math.random() * wordsArray.length)];
}

function checkWordleGuess(guess, secret) {
    const result = [];
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    for (let i = 0; i < secretArr.length; i++) {
        if (guessArr[i] === secretArr[i]) { result[i] = 'jade'; secretArr[i] = null; guessArr[i] = null; }
    }
    for (let i = 0; i < guessArr.length; i++) {
        if (guessArr[i] === null) continue;
        const idx = secretArr.indexOf(guessArr[i]);
        if (idx !== -1) { result[i] = 'gold'; secretArr[idx] = null; }
        else { result[i] = 'mist'; }
    }
    return result;
}

app.get('/api/wordle/lobby/:id', ensureAuth, async (req, res) => {
    try {
        const lobby = await WordleLobby.findById(req.params.id);
        if (!lobby) return res.status(404).json({ error: 'Лобби не найдено' });
        let changed = false;
        if (!lobby.players.find(p => p.userId === req.user.id)) {
            lobby.players.push({ userId: req.user.id, name: req.user.username });
            changed = true;
            await lobby.save();
        }
        if (changed && lobby.status === 'waiting') {
            const client = req.app.get('botClient');
            const channel = await client.channels.fetch(lobby.channelId).catch(() => null);
            if (channel && lobby.messageId) {
                const msg = await channel.messages.fetch(lobby.messageId).catch(() => null);
                if (msg) {
                    const siteUrl = `https://patchitos1234.fly.dev/wordle/lobby/${lobby._id}`;
                    const embed = new EmbedBuilder()
                        .setTitle('📜 Свиток Иероглифов')
                        .setDescription(`Лобби создано!\n\n👑 **Хост:** <@${lobby.hostId}>\n👥 **Игроков:** ${lobby.players.length}\n🔤 **Режим:** ${lobby.wordLength} букв / ${lobby.maxAttempts} попыток\n\nНажмите кнопку ниже, чтобы присоединиться к гонке.`)
                        .setColor('#d4af37')
                        .setFooter({ text: 'Where Winds Meet • Мини-игра' });
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🎮 Присоединиться').setURL(siteUrl).setStyle(ButtonStyle.Link));
                    await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
                }
            }
        }
        const isHost = lobby.hostId === req.user.id;
        res.json({ lobby, isHost });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/wordle/lobby/:id/settings', ensureAuth, async (req, res) => {
    try {
        const lobby = await WordleLobby.findById(req.params.id);
        if (!lobby) return res.status(404).json({ error: 'Не найдено' });
        if (lobby.hostId !== req.user.id) return res.status(403).json({ error: 'Только хост' });
        if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Игра уже началась' });
        const { wordLength, maxAttempts } = req.body;
        if (wordLength && [4, 5, 6, 7].includes(Number(wordLength))) {
            lobby.wordLength = Number(wordLength);
            lobby.maxAttempts = Number(maxAttempts) || (Number(wordLength) + 1);
            await lobby.save();
        }
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/wordle/lobby/:id/start', ensureAuth, async (req, res) => {
    try {
        const lobby = await WordleLobby.findById(req.params.id);
        if (!lobby) return res.status(404).json({ error: 'Не найдено' });
        if (lobby.hostId !== req.user.id) return res.status(403).json({ error: 'Только хост' });
        if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Уже идет игра' });
        if (!lobby.wordLength || ![4, 5, 6, 7].includes(lobby.wordLength)) {
            lobby.wordLength = 5;
            lobby.maxAttempts = 6;
        }
        const dict = ALLOWED_WORDS[lobby.wordLength];
        if (!dict || dict.size === 0) return res.status(500).json({ error: 'Словарь пуст' });
        const wordsArray = Array.from(dict);
        lobby.secretWord = wordsArray[Math.floor(Math.random() * wordsArray.length)];
        lobby.status = 'playing';
        lobby.currentRound = 1;
        lobby.players.forEach(p => { p.attempts = []; p.isWinner = false; p.finishTime = null; });
        await lobby.save();
        const client = req.app.get('botClient');
        const channel = await client.channels.fetch(lobby.channelId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(lobby.messageId).catch(() => null);
            if (msg) {
                const embed = new EmbedBuilder().setTitle('📜 Свиток Иероглифов').setDescription(`⚔️ **Гонка началась!**\nДлина слова: ${lobby.wordLength} букв.\nПопыток: ${lobby.maxAttempts}.\nВперед!`).setColor('#e67e22');
                await msg.edit({ embeds: [embed], components: [] });
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/wordle/lobby/:id/guess', ensureAuth, async (req, res) => {
    try {
        const { guess } = req.body;
        const lobby = await WordleLobby.findById(req.params.id);
        if (!lobby || lobby.status !== 'playing') return res.status(400).json({ error: 'Игра не идет' });
        const player = lobby.players.find(p => p.userId === req.user.id);
        if (!player) return res.status(403).json({ error: 'Вы не в лобби' });
        if (player.isWinner || player.attempts.length >= lobby.maxAttempts) return res.status(400).json({ error: 'Вы уже закончили' });
        const word = guess.toUpperCase().replace(/Ё/g, 'Е');
        const secret = lobby.secretWord;
        if (word.length !== lobby.wordLength) return res.status(400).json({ error: `Нужно слово ровно из ${lobby.wordLength} букв` });
        if (!ALLOWED_WORDS[lobby.wordLength].has(word)) return res.status(400).json({ error: 'Такого слова нет в словаре. Введите реальное существительное.' });
        const result = checkWordleGuess(word, secret);
        player.attempts.push({ word, result });
        if (word === secret) { player.isWinner = true; player.finishTime = Date.now(); }
        await lobby.save();
        const allFinished = lobby.players.every(p => p.isWinner || p.attempts.length >= lobby.maxAttempts);
        if (allFinished) {
            lobby.status = 'finished';
            await lobby.save();
            const client = req.app.get('botClient');
            const channel = await client.channels.fetch(lobby.channelId).catch(() => null);
            if (channel) {
                const sortedPlayers = [...lobby.players].sort((a, b) => {
                    if (a.isWinner && !b.isWinner) return -1;
                    if (!a.isWinner && b.isWinner) return 1;
                    if (a.isWinner && b.isWinner) return (a.finishTime || 0) - (b.finishTime || 0);
                    return a.attempts.length - b.attempts.length;
                });
                let summaryText = `Загаданное слово: **${lobby.secretWord}**\n\n`;
                for (let i = 0; i < sortedPlayers.length; i++) {
                    const p = sortedPlayers[i];
                    let attemptsText = p.isWinner ? `${p.attempts.length}/${lobby.maxAttempts}` : `X/${lobby.maxAttempts}`;
                    let medal = i === 0 ? '🥇 ' : (i === 1 ? '🥈 ' : (i === 2 ? '🥉 ' : ''));
                    summaryText += `${medal}**${attemptsText}** <@${p.userId}>\n`;
                    for (let r = 0; r < lobby.maxAttempts; r++) {
                        const attempt = p.attempts[r];
                        if (attempt) {
                            let rowEmoji = '';
                            for (let c = 0; c < lobby.wordLength; c++) {
                                if (attempt.result[c] === 'jade') rowEmoji += '🟩';
                                else if (attempt.result[c] === 'gold') rowEmoji += '🟨';
                                else rowEmoji += '⬛';
                            }
                            summaryText += `> ${rowEmoji}\n`;
                        }
                    }
                    summaryText += '\n';
                }
                const embed = new EmbedBuilder().setTitle('📜 Свиток Иероглифов: Итоги').setDescription(summaryText).setColor('#d4af37').setFooter({ text: 'Where Winds Meet • Мини-игра' });
                await channel.send({ embeds: [embed] });
                if (lobby.messageId) {
                    const oldMsg = await channel.messages.fetch(lobby.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                }
            }
        }
        res.json({ success: true, result, isWinner: player.isWinner, allFinished });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/wordle/lobby/:id/status', ensureAuth, async (req, res) => {
    try {
        const lobby = await WordleLobby.findById(req.params.id);
        if (!lobby) return res.status(404).json({ error: 'Не найдено' });
        const status = lobby.players.map(p => ({
            userId: p.userId, name: p.name, attemptsCount: p.attempts.length, isFinished: p.isWinner || p.attempts.length >= lobby.maxAttempts, isWinner: p.isWinner
        }));
        res.json({ status: lobby.status, players: status, wordLength: lobby.wordLength, maxAttempts: lobby.maxAttempts, secretWord: lobby.status === 'finished' ? lobby.secretWord : null });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ─── 404 и запуск сервера ─────────────────────────────────
app.use((req, res) => { res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); });

function startWebServer(botClient) {
    app.set('botClient', botClient);
    startEventNotifier(botClient);
    app.listen(process.env.PORT || 8080, () => console.log(`🌐 Веб-панель запущена на порту ${process.env.PORT || 8080}`));
}

module.exports = { startWebServer };
