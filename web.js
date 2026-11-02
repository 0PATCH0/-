const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
    ReactionRole, Settings, Reminder, SentMessage, Roster, RosterConfig, RosterMessage, Log, Guide, PlayerProfile, Event, Challenge 
} = require('./models');
const { refreshRosterMessage } = require('./roster-refresh');

const OWNER_ID = '439798786059927552';

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

        // ─── 1. Обновляем / создаем сообщение у ОППОНЕНТА ───
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

                if (existingMsg) {
                    await existingMsg.edit({ content, embeds: [buildEmbed(challenge.opponentGuildId)], components: [row] });
                } else {
                    await oppChannel.send({ content, embeds: [buildEmbed(challenge.opponentGuildId)], components: [row] });
                }
            }
        }

        // ─── 2. Обновляем / создаем сообщение у ВЫЗЫВАЮЩЕГО ───
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

                if (existingMsg) {
                    await existingMsg.edit({ content, embeds: [buildEmbed(challenge.challengerGuildId)], components: [row] });
                } else {
                    await challChannel.send({ content, embeds: [buildEmbed(challenge.challengerGuildId)], components: [row] });
                }
            }
        }
    } catch (e) { console.error('UPDATE DUEL MSG:', e); }
}

// ─── AUTH ─────────────────────────────────────────────────
app.get('/auth/discord', (req, res, next) => {
    // Сохраняем returnTo в state параметре OAuth (он вернется в callback)
    const returnTo = req.query.returnTo || '/dashboard';
    passport.authenticate('discord', { state: returnTo })(req, res, next);
});

app.get('/auth/discord/callback', (req, res, next) => {
    passport.authenticate('discord', { failureRedirect: '/' }, (err, user) => {
        if (err || !user) return res.redirect('/');
        req.logIn(user, (err) => {
            if (err) return res.redirect('/');
            // Берем returnTo из state
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

// ─── ПРОФИЛЬ ──────────────────────────────────────────────
app.get('/api/profile/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const targetUserId = req.query.user || req.user.id;
        const guildId = resolveProfileGuildId(req);
        let profile = await PlayerProfile.findOne({ userId: targetUserId, guildId });
        if (!profile) profile = await PlayerProfile.findOne({ userId: targetUserId, isGlobal: true });
        if (!profile) {
            return res.json({
                _id: null, userId: targetUserId, guildId, isGlobal: false,
                characters: [{
                    gameNickname: '', guildName: '', bio: '',
                    builds: { PvE: { mysticSkills: [], innerWays: [] }, PvP: { mysticSkills: [], innerWays: [] } }
                }]
            });
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
        if (targetUser && targetUser !== req.user.id && req.user.id !== OWNER_ID) {
            return res.status(403).json({ error: 'Нельзя изменить чужой профиль' });
        }
        const cleanCharacters = normalizeProfileCharacters(characters);
        if (cleanCharacters.length === 0) {
            return res.status(400).json({ error: 'Нужен хотя бы один персонаж с ником' });
        }
        const profile = await PlayerProfile.findOneAndUpdate(
            { userId: finalUserId, guildId },
            { characters: cleanCharacters, isGlobal: !!isGlobal },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
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
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка базы данных' }); }
});

// ─── АДМИН ПРОФИЛЕЙ ───────────────────────────────────────
app.get('/api/guild/:id/profiles', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        const profiles = await PlayerProfile.find({ $or: [ { guildId: req.params.id }, { isGlobal: true } ] });
        const enriched = await Promise.all(profiles.map(async (p) => {
            const member = await discordGuild.members.fetch(p.userId).catch(() => null);
            return {
                ...p._doc,
                discordName: member ? member.user.username : 'Неизвестный',
                avatar: member && member.user.avatar
                    ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/0.png`
            };
        }));
        res.json(enriched);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/guild/:id/profiles/:userId', isModerator, async (req, res) => {
    try {
        await PlayerProfile.findOneAndDelete({ userId: req.params.userId, guildId: req.params.id });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── ПУБЛИЧНЫЙ СПИСОК ПРОФИЛЕЙ ────────────────────────────
app.get('/api/guild/:id/profiles-public', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });

        const raw = await PlayerProfile.find({
            $or: [ { guildId: req.params.id }, { isGlobal: true } ]
        });

        const local = raw.filter(p => {
            if (p.guildId === req.params.id) return true;
            return discordGuild.members.cache.has(p.userId);
        });

        const enriched = await Promise.all(local.map(async (p) => {
            const member = await discordGuild.members.fetch(p.userId).catch(() => null);
            return {
                _id: p._id, userId: p.userId, guildId: p.guildId, isGlobal: p.isGlobal,
                characters: p.characters,
                discordName: member ? member.user.username : 'Неизвестный',
                avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`
            };
        }));

        res.json({ local: enriched, global: [] });
    } catch (e) { console.error('PROFILES PUBLIC:', e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});

// ─── СПИСОК ГИЛЬДИЙ БОТА ──────────────────────────────────
app.get('/api/guilds-list', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const list = client.guilds.cache.map(g => ({
            id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
        }));
        res.json(list);
    } catch (e) { console.error('GUILDS LIST:', e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── ГЛОБАЛЬНЫЕ ПРОФИЛИ ───────────────────────────────────
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
            return {
                _id: p._id, userId: p.userId, guildId: p.guildId,
                guildName: discordGuild ? discordGuild.name : 'Неизвестная гильдия',
                isGlobal: p.isGlobal, characters: p.characters,
                discordName: member ? member.user.username : 'Неизвестный',
                avatar: member && member.user.avatar ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`,
                inGuild: !!member
            };
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
    } catch (e) { console.error('PROFILES GLOBAL:', e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});

// ─── СОБЫТИЯ ──────────────────────────────────────────────
app.get('/api/events/:guildId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try { res.json(await Event.find({ guildId: req.params.guildId }).sort({ date: 1 })); }
    catch (e) { console.error('EVENTS LIST:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/events/:guildId', isModerator, async (req, res) => {
    try {
        const { title, description, date, channelId, pingRoleId, imageUrl } = req.body || {};
        if (!title || !date) return res.status(400).json({ error: 'title и date обязательны' });
        const event = await Event.create({ guildId: req.params.guildId, title, description: description || '', date: Number(date), creatorId: req.user.id, attendees: [] });
        let discordMessageId = null;
        if (channelId) {
            const client = req.app.get('botClient');
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel && channel.isTextBased && channel.isTextBased()) {
                const dateUnix = Math.floor(Number(date) / 1000);
                const embed = new EmbedBuilder()
                    .setTitle('📅 ' + title)
                    .setColor('#d4af37')
                    .setDescription((description || 'Событие создано.') + '\n\n🕒 **Начало:** <t:' + dateUnix + ':F> (<t:' + dateUnix + ':R>)')
                    .addFields({ name: '✍️ Записаться', value: 'Открой сайт → События → «Записаться»', inline: false })
                    .setFooter({ text: 'Where Winds Meet • События' })
                    .setTimestamp();
                if (imageUrl) embed.setImage(imageUrl);
                const button = new ButtonBuilder().setLabel('Открыть события на сайте').setURL('https://patchitos1234.fly.dev/manage/' + req.params.guildId + '/events').setStyle(ButtonStyle.Link);
                const row = new ActionRowBuilder().addComponents(button);
                const content = pingRoleId ? '<@&' + pingRoleId + '>' : undefined;
                const msg = await channel.send({ content, embeds: [embed], components: [row] }).catch(() => null);
                if (msg) discordMessageId = msg.id;
            }
        }
        res.json({ success: true, event, discordMessageId });
    } catch (e) { console.error('EVENT CREATE:', e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
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
    } catch (e) { console.error('EVENT JOIN:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/events/:guildId/:eventId', isModerator, async (req, res) => {
    try { await Event.findByIdAndDelete(req.params.eventId); res.json({ success: true }); }
    catch (e) { console.error('EVENT DELETE:', e); res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/guild/:id/channels', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });
        const channels = guild.channels.cache.filter(ch => ch.isTextBased && ch.isTextBased() && !ch.isThread() && ch.type !== 4).map(ch => ({ id: ch.id, name: ch.name }));
        const roles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed && !r.name.startsWith('@')).map(r => ({ id: r.id, name: r.name }));
        res.json({ channels, roles });
        } catch (e) { console.error('GUILD CHANNELS:', e); res.status(500).json({ error: 'Ошибка' }); }
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

        res.json({ 
            challenge, 
            challengerGuild: { id: challengerGuild?.id, name: challengerGuild?.name || 'Неизвестно', icon: challengerGuild?.icon }, 
            opponentGuild: { id: opponentGuild?.id, name: opponentGuild?.name || 'Неизвестно', icon: opponentGuild?.icon }, 
            canManageChallenger: isChallengerMod, 
            canManageOpponent: isOpponentMod 
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ─── СПИСОК ВЫЗОВОВ ───────────────────────────────────────
app.get('/api/guild/:id/challenges', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const challenges = await Challenge.find({
            $or: [{ challengerGuildId: req.params.id }, { opponentGuildId: req.params.id }]
        }).sort({ time: -1 }).limit(10);

        const client = req.app.get('botClient');
        const enriched = await Promise.all(challenges.map(async ch => {
            const chGuild = client.guilds.cache.get(ch.challengerGuildId);
            const oppGuild = client.guilds.cache.get(ch.opponentGuildId);
            return {
                _id: ch._id,
                time: ch.time,
                format: ch.format,
                status: ch.status,
                challengerName: chGuild?.name || 'Неизвестно',
                opponentName: oppGuild?.name || 'Неизвестно'
            };
        }));
        res.json(enriched);
    } catch (e) {
        console.error('CHALLENGES LIST:', e);
        res.status(500).json({ error: 'Ошибка' });
    }
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

        if (challenge.status !== 'accepted' && challenge.status !== 'in_progress') {
            return res.status(400).json({ error: 'Сначала примите вызов' });
        }

        const client = req.app.get('botClient');
        const guildId = side === 'challenger' ? challenge.challengerGuildId : challenge.opponentGuildId;
        const discordGuild = client.guilds.cache.get(guildId);

        let isMod = false;
        if (req.user.id === OWNER_ID) {
            isMod = true;
        } else if (discordGuild) {
            const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
            if (member) {
                const settings = await Settings.findOne({ guildId });
                const userGuildInfo = req.user.guilds.find(g => g.id === guildId);
                const isDiscordAdmin = userGuildInfo && (BigInt(userGuildInfo.permissions) & BigInt(0x8)) === BigInt(0x8);
                const isModRole = settings && settings.modRoles && member.roles.cache.some(r => settings.modRoles.includes(r.id));
                if (isDiscordAdmin || isModRole) isMod = true;
            }
        }

        if (!isMod) {
            return res.status(403).json({ error: 'Вы не модератор этой гильдии' });
        }

        const match = challenge.matches.find(m => m.matchIndex === Number(matchIndex));
        if (!match) return res.status(400).json({ error: 'Матч не найден' });

        if (req.user.id !== OWNER_ID) {
            if (side === 'challenger' && match.challengerPlayer) {
                return res.status(400).json({ error: 'Боец уже выбран. Дождитесь начала боя.' });
            }
            if (side === 'opponent' && match.opponentPlayer) {
                return res.status(400).json({ error: 'Боец уже выбран. Дождитесь начала боя.' });
            }
        }

        if (side === 'challenger') match.challengerPlayer = { userId, name };
        else if (side === 'opponent') match.opponentPlayer = { userId, name };

        challenge.markModified('matches');
        await challenge.save();
        res.json({ success: true, matches: challenge.matches });
    } catch (e) { 
        console.error('SET PLAYER:', e); 
        res.status(500).json({ error: 'Ошибка' }); 
    }
});

app.post('/api/duel/:id/start', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });

        const allFilled = challenge.matches.every(m => m.challengerPlayer && m.opponentPlayer);
        if (!allFilled) {
            return res.status(400).json({ error: 'Не все матчи заполнены. Назначьте бойцов.' });
        }

        challenge.status = 'in_progress';
        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        res.json({ success: true });
    } catch (e) { console.error('START DUEL:', e); res.status(500).json({ error: 'Ошибка' }); }

    // Установить победителя матча
app.post('/api/duel/:id/set-winner', ensureAuth, async (req, res) => {
    try {
        const { matchIndex, winnerSide } = req.body;
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });
        
        if (challenge.status !== 'in_progress') {
            return res.status(400).json({ error: 'Бои еще не начались' });
        }

        const match = challenge.matches.find(m => m.matchIndex === Number(matchIndex));
        if (!match) return res.status(400).json({ error: 'Матч не найден' });

        match.winner = winnerSide; // 'challenger' | 'opponent'
        challenge.markModified('matches');

        // Проверяем, завершились ли все бои
        const totalMatches = challenge.matches.length;
        const finishedMatches = challenge.matches.filter(m => m.winner !== null).length;

        if (finishedMatches === totalMatches) {
            challenge.status = 'completed';
            
            // Считаем победы
            const chWins = challenge.matches.filter(m => m.winner === 'challenger').length;
            const oppWins = challenge.matches.filter(m => m.winner === 'opponent').length;
            
            if (chWins > oppWins) challenge.winnerGuildId = challenge.challengerGuildId;
            else if (oppWins > chWins) challenge.winnerGuildId = challenge.opponentGuildId;
            // Если ничья — winnerGuildId остается null
        }

        await challenge.save();
        try { await updateDuelMessage(req.app.get('botClient'), challenge._id); } catch (e) {}
        
        res.json({ success: true, status: challenge.status, matches: challenge.matches, winnerGuildId: challenge.winnerGuildId });
    } catch (e) { console.error('SET WINNER:', e); res.status(500).json({ error: 'Ошибка' }); }
});

// Удалить вызов
app.delete('/api/duel/:id', ensureAuth, async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Не найдено' });

        // Проверка прав (только модератор гильдии может удалить)
        const client = req.app.get('botClient');
        const isChallenger = await (async () => {
            const g = req.user.guilds.find(gi => gi.id === challenge.challengerGuildId);
            if (g && (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) return true;
            const s = await Settings.findOne({ guildId: challenge.challengerGuildId });
            if (s && s.modRoles) {
                const guild = client.guilds.cache.get(challenge.challengerGuildId);
                const m = await guild.members.fetch(req.user.id).catch(() => null);
                if (m && m.roles.cache.some(r => s.modRoles.includes(r.id))) return true;
            }
            return false;
        })();
        const isOpponent = await (async () => {
            const g = req.user.guilds.find(gi => gi.id === challenge.opponentGuildId);
            if (g && (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) return true;
            const s = await Settings.findOne({ guildId: challenge.opponentGuildId });
            if (s && s.modRoles) {
                const guild = client.guilds.cache.get(challenge.opponentGuildId);
                const m = await guild.members.fetch(req.user.id).catch(() => null);
                if (m && m.roles.cache.some(r => s.modRoles.includes(r.id))) return true;
            }
            return false;
        })();

        if (!isChallenger && !isOpponent && req.user.id !== OWNER_ID) {
            return res.status(403).json({ error: 'Нет прав на удаление' });
        }

        // Удаляем сообщения из Discord
        if (challenge.channelId && challenge.messageId) {
            const channel = await client.channels.fetch(challenge.channelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(challenge.messageId).catch(() => null);
                if (msg) await msg.delete().catch(() => {});
            }
        }
        // Удаляем из БД
        await Challenge.findByIdAndDelete(req.params.id);
        
        res.json({ success: true });
    } catch (e) { console.error('DELETE DUEL:', e); res.status(500).json({ error: 'Ошибка' }); }
});
});

// ─── ВЫЗОВЫ (СОЗДАНИЕ) ────────────────────────────────────
app.post('/api/guild/:id/challenge', isModerator, async (req, res) => {
    try {
        const { opponentGuildId, time, format } = req.body || {};
        const challengerGuildId = req.params.id;

        if (!opponentGuildId || !time || !format) {
            return res.status(400).json({ error: 'Не все поля заполнены' });
        }
        if (opponentGuildId === challengerGuildId) {
            return res.status(400).json({ error: 'Нельзя вызвать свою же гильдию' });
        }

        const client = req.app.get('botClient');
        const opponentGuild = client.guilds.cache.get(opponentGuildId);
        if (!opponentGuild) return res.status(404).json({ error: 'Гильдия-оппонент не найдена' });

        const oppSettings = await Settings.findOne({ guildId: opponentGuildId });
        if (!oppSettings || !oppSettings.challengeChannelId) {
            return res.status(400).json({ error: 'Оппонент не настроил канал для вызовов' });
        }

        const channel = await client.channels.fetch(oppSettings.challengeChannelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Канал оппонента не найден' });

        const numMatches = parseInt(format) || 1;
        const matches = Array.from({ length: numMatches }).map((_, i) => ({
            matchIndex: i + 1,
            challengerPlayer: null,
            opponentPlayer: null,
            winner: null
        }));

        const challenge = await Challenge.create({
            challengerGuildId,
            opponentGuildId,
            time: Number(time),
            format: numMatches,
            status: 'pending',
            channelId: oppSettings.challengeChannelId,
            matches: matches
        });

        const challGuild = client.guilds.cache.get(challengerGuildId);
        const timeUnix = Math.floor(Number(time));

        const embed = new EmbedBuilder()
            .setTitle('⚔️ Вызов на Дуэль!')
            .setColor('#e74c3c')
            .setDescription(`Гильдия **${challGuild.name}** бросает вызов вашей гильдии!`)
            .addFields(
                { name: '🏰 Вызывающий', value: challGuild.name, inline: true },
                { name: '🛡️ Оппонент', value: opponentGuild.name, inline: true },
                { name: '🕒 Время', value: `<t:${timeUnix}:F> (<t:${timeUnix}:R>)`, inline: false },
                { name: '⚔️ Формат', value: `${numMatches} ${numMatches == 1 ? 'бой' : 'боёв'}`, inline: true }
            )
            .setFooter({ text: 'Нажмите кнопку ниже, чтобы перейти на сайт' });

        const button = new ButtonBuilder()
            .setLabel('Открыть страницу дуэли')
            .setURL('https://patchitos1234.fly.dev/duel/' + challenge._id)
            .setStyle(ButtonStyle.Link);
        const row = new ActionRowBuilder().addComponents(button);

        const modPings = (oppSettings.modRoles || []).map(id => `<@&${id}>`).join(' ');
        const content = modPings ? modPings + ', вам вызов!' : 'Вам вызов!';

        const msg = await channel.send({ content, embeds: [embed], components: [row] });

        challenge.messageId = msg.id;
        await challenge.save();

        res.json({ success: true, challengeId: challenge._id });
    } catch (e) {
        console.error('CHALLENGE CREATE:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ─── ГАЙДЫ ────────────────────────────────────────────────
app.get('/api/guild/:id/guides', isModerator, async (req, res) => {
    try { res.json(await Guide.find({ guildId: req.params.id }).sort({ date: -1 })); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.get('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try { res.json(await Guide.findById(req.params.guideId)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/guides', isModerator, async (req, res) => {
    try { await Guide.create({ guildId: req.params.id, ...req.body }); res.json({ success: true }); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.put('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try { await Guide.findByIdAndUpdate(req.params.guideId, req.body); res.json({ success: true }); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.delete('/api/guild/:id/guides/:guideId', isModerator, async (req, res) => {
    try { await Guide.findByIdAndDelete(req.params.guideId); res.json({ success: true }); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── ЛОГИ ─────────────────────────────────────────────────
app.get('/api/guild/:id/logs', isModerator, async (req, res) => {
    try { res.json(await Log.find({ guildId: req.params.id }).sort({ date: -1 }).limit(100)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── МОДЕРАЦИЯ ────────────────────────────────────────────
app.get('/api/guild/:id/moderation', isModerator, async (req, res) => {
    try {
        let s = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] });
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        const channels = guild ? guild.channels.cache
            .filter(ch => ch.isTextBased && ch.isTextBased() && !ch.isThread() && ch.type !== 4)
            .map(ch => ({ id: ch.id, name: ch.name })) : [];
        res.json({ modRoles: s.modRoles || [], challengeChannelId: s.challengeChannelId || null, channels });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/guild/:id/moderation', isModerator, async (req, res) => {
    try {
        const { modRoles, challengeChannelId } = req.body;
        await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles, challengeChannelId }, { upsert: true });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── НАПОМИНАНИЯ ──────────────────────────────────────────
app.get('/api/guild/:id/reminders', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try { res.json(await Reminder.find({ userId: req.user.id })); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/reminders', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const { text, channelId, targetId, targetType, repeat, nextTime, hour, minute, timezone } = req.body || {};
        const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const reminder = await Reminder.create({ id, userId: req.user.id, channelId, text, targetId, targetType, repeat, nextTime: Number(nextTime) || Date.now(), hour, minute, timezone: Number(timezone) || 0 });
        res.json({ success: true, reminder });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.delete('/api/guild/:id/reminders/:reminderId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        await Reminder.findOneAndDelete({ id: req.params.reminderId, userId: req.user.id });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── РЕАКЦИИ-РОЛИ ─────────────────────────────────────────
app.get('/api/guild/:id/reactionroles', isModerator, async (req, res) => {
    try { res.json(await ReactionRole.find({ guildId: req.params.id })); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/reactionroles', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const { channelId, title, desc, color, mode, roles } = req.body || {};
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Канал не найден' });
        const embed = new EmbedBuilder().setTitle(title || 'Роли').setDescription(desc || 'Выберите роль').setColor(color || '#d4af37');
        const buttons = (roles || []).map(r => new ButtonBuilder().setCustomId(`rr_${r.roleId}`).setLabel(r.label || 'Роль').setStyle(ButtonStyle.Secondary).setEmoji(r.emoji || '🎭'));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        const msg = await channel.send({ embeds: [embed], components: rows });
        const rr = await ReactionRole.create({ guildId: req.params.id, channelId, messageId: msg.id, title, desc, color, mode: mode || 'multiple', roles });
        res.json({ success: true, reactionRole: rr });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});
app.delete('/api/guild/:id/reactionroles/:messageId', isModerator, async (req, res) => {
    try {
        await ReactionRole.findOneAndDelete({ messageId: req.params.messageId, guildId: req.params.id });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── КАСТОМНЫЕ СООБЩЕНИЯ ──────────────────────────────────
app.get('/api/guild/:id/custom', isModerator, async (req, res) => {
    try { res.json(await SentMessage.find({ guildId: req.params.id })); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/custom', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const { channelId, title, description, color, image, footer, author } = req.body || {};
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Канал не найден' });
        const embed = new EmbedBuilder().setTitle(title || 'Сообщение').setDescription(description || '').setColor(color || '#d4af37');
        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });
        if (author) embed.setAuthor({ name: author });
        const msg = await channel.send({ embeds: [embed] });
        const sm = await SentMessage.create({ guildId: req.params.id, channelId, messageId: msg.id, title, description, color, image, footer, author });
        res.json({ success: true, message: sm });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});
app.delete('/api/guild/:id/custom/:messageId', isModerator, async (req, res) => {
    try {
        await SentMessage.findOneAndDelete({ messageId: req.params.messageId, guildId: req.params.id });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── РОСТЕР ───────────────────────────────────────────────
app.get('/api/guild/:id/roster-check', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const client = req.app.get('botClient');
        const discordGuild = client.guilds.cache.get(req.params.id);
        if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });
        const member = await discordGuild.members.fetch(req.user.id).catch(() => null);
        if (!member) return res.status(403).json({ error: 'Вы не на сервере', canView: false });
        const settings = await Settings.findOne({ guildId: req.params.id });
        const userGuildInfo = req.user.guilds.find(g => g.id === req.params.id);
        const isDiscordAdmin = userGuildInfo && (BigInt(userGuildInfo.permissions) & BigInt(0x8)) === BigInt(0x8);
        const isBotOwner = req.user.id === OWNER_ID;
        const isModRole = settings && settings.modRoles && member.roles.cache.some(r => settings.modRoles.includes(r.id));
        const isMod = isBotOwner || isDiscordAdmin || isModRole;
        if (isMod) return res.json({ canView: true, isMod: true, configured: true });
        if (!settings || !settings.rosterRoleIds || settings.rosterRoleIds.length === 0) return res.json({ canView: false, isMod: false, configured: false });
        const hasAccess = member.roles.cache.some(r => settings.rosterRoleIds.includes(r.id));
        return res.json({ canView: hasAccess, isMod: false, configured: true });
    } catch (e) { console.error('ROSTER CHECK:', e); res.status(500).json({ error: 'Ошибка' }); }
});
app.get('/api/guild/:id/roster-access', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Бот не на сервере' });
        const settings = await Settings.findOne({ guildId: req.params.id }) || await Settings.create({ guildId: req.params.id, modRoles: [] });
        const allRoles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
        res.json({ rosterRoleIds: settings.rosterRoleIds || [], allRoles });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/roster-access', isModerator, async (req, res) => {
    try {
        const { rosterRoleIds } = req.body || {};
        if (!Array.isArray(rosterRoleIds)) return res.status(400).json({ error: 'rosterRoleIds должен быть массивом' });
        await Settings.findOneAndUpdate({ guildId: req.params.id }, { rosterRoleIds }, { upsert: true });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.get('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const guild = client.guilds.cache.get(req.params.id);
        let config = await RosterConfig.findOne({ guildId: req.params.id });
        if (!config) config = { guildId: req.params.id, columns: getDefaultRosterColumns(), manualAssignments: {} };
        const allRoles = guild ? guild.roles.cache.filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name })) : [];
        res.json({ columns: config.columns && config.columns.length > 0 ? config.columns : getDefaultRosterColumns(), manualAssignments: config.manualAssignments || {}, allRoles });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.post('/api/guild/:id/roster-config', isModerator, async (req, res) => {
    try {
        const { columns } = req.body || {};
        if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns должен быть массивом' });
        const BASE_CLASSES = [
            { key: 'dps', name: 'ДД', icon: 'dps', color: '#e74c3c', isClass: true },
            { key: 'tank', name: 'Танк', icon: 'tank', color: '#2ecc71', isClass: true },
            { key: 'healer', name: 'Хил', icon: 'healer', color: '#9b59b6', isClass: true }
        ];
        const existing = await RosterConfig.findOne({ guildId: req.params.id });
        const existingClasses = (existing && existing.columns || []).filter(c => c.isClass);
        const baseClasses = BASE_CLASSES.map(def => {
            const found = existingClasses.find(c => c.key === def.key);
            return found ? { ...def, name: found.name || def.name } : def;
        });
        const custom = columns.filter(c => c.isClass !== true).map(c => ({ key: c.key, name: c.name, icon: c.icon || 'custom', color: c.color || '#d4af37', isClass: false }));
        const finalColumns = [...custom, ...baseClasses];
        finalColumns.forEach((c, i) => { c.order = i; });
        const config = await RosterConfig.findOneAndUpdate({ guildId: req.params.id }, { columns: finalColumns }, { upsert: true, new: true });
        res.json({ success: true, config });
        try { refreshRosterMessage(req.app.get('botClient'), req.params.id); } catch (e) {}
    } catch (e) { console.error('ROSTER CONFIG POST:', e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});
app.post('/api/guild/:id/roster-manual', isModerator, async (req, res) => {
    try {
        const { userId, columnKey } = req.body || {};
        if (!userId) return res.status(400).json({ error: 'userId обязателен' });
        let config = await RosterConfig.findOne({ guildId: req.params.id });
        if (!config) config = await RosterConfig.create({ guildId: req.params.id, columns: getDefaultRosterColumns(), manualAssignments: {} });
        if (!config.manualAssignments) config.manualAssignments = {};
        if (columnKey) config.manualAssignments[userId] = columnKey;
        else delete config.manualAssignments[userId];
        config.markModified('manualAssignments');
        await config.save();
        res.json({ success: true, manualAssignments: config.manualAssignments });
        try { refreshRosterMessage(req.app.get('botClient'), req.params.id); } catch (e) {}
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});
app.get('/api/guild/:id/roster', canViewRoster, async (req, res) => {
    try {
        const botClient = req.app.get('botClient');
        const { buildClassifiedRoster } = require('./roster-refresh');
        const roster = await buildClassifiedRoster(botClient, req.params.id);
        const stats = { total: roster.members.length, classified: roster.members.filter(m => m.detectedClass !== 'none' || m.manualColumnKey).length };
        res.json({ configured: true, columns: roster.columns, members: roster.members, isMod: !!req.isRosterMod, stats });
    } catch (e) { console.error('ROSTER GET:', e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});
app.post('/api/guild/:id/roster/setup', isModerator, async (req, res) => {
    try {
        const client = req.app.get('botClient');
        const { channelId } = req.body || {};
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Канал не найден' });
        const config = await RosterConfig.findOne({ guildId: req.params.id });
        if (!config || !config.columns || config.columns.length === 0) return res.status(400).json({ error: 'Сначала настройте колонки' });
        const existing = await RosterMessage.findOne({ guildId: req.params.id });
        if (existing) {
            const oldMsg = await channel.messages.fetch(existing.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
        }
        const embed = new EmbedBuilder().setTitle('🛡️ Состав гильдии').setColor('#2b2d31').setDescription('Обновляется...');
        const msg = await channel.send({ embeds: [embed] });
        await RosterMessage.findOneAndUpdate({ guildId: req.params.id }, { channelId, messageId: msg.id }, { upsert: true });
        res.json({ success: true, messageId: msg.id });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка: ' + e.message }); }
});
app.delete('/api/guild/:id/roster/setup', isModerator, async (req, res) => {
    try {
        await RosterMessage.findOneAndDelete({ guildId: req.params.id });
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => { res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); });

function startWebServer(botClient) {
    app.set('botClient', botClient);
    app.listen(process.env.PORT || 8080, () => console.log('🌐 Веб-панель запущена'));
}

module.exports = { startWebServer };
