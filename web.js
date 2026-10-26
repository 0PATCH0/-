const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ReactionRole } = require('./models'); // Подключаем схему

const app = express();

app.use(express.json()); // Важно для приема JSON с сайта
app.use(session({
    secret: 'super_secret_bot_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'https://discord-bot-24oz.onrender.com/auth/discord/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => { res.redirect('/dashboard'); }
);

app.get('/dashboard', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- РОУТЫ ДЛЯ УПРАВЛЕНИЯ СЕРВЕРОМ ---
app.get('/manage/:id', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'guild.html'));
});

app.get('/manage/:id/reactionroles', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

app.get('/api/guild/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: 'Доступ запрещен' });

    const client = req.app.get('botClient'); 
    const discordGuild = client.guilds.cache.get(req.params.id);
    if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });

    const roles = discordGuild.roles.cache
        .filter(r => r.id !== discordGuild.id && !r.managed)
        .map(r => ({ id: r.id, name: r.name }));

    res.json({ name: guild.name, roles });
});

// --- ГЛАВНЫЙ РОУТ ОТПРАВКИ СООБЩЕНИЯ ---
app.post('/api/guild/:id/reactionroles', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    const { title, desc, color, channelId, mode, roles } = req.body;
    const guildId = req.params.id;
    const client = req.app.get('botClient');

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Канал не найден или у бота нет к нему доступа.' });

        // Создаем Embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(color || '#5865F2');

        // Создаем кнопки (максимум 5 в ряду)
        const actionRows = [];
        let currentRow = new ActionRowBuilder();

        roles.forEach((r, index) => {
            if (index > 0 && index % 5 === 0) {
                actionRows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            const button = new ButtonBuilder()
                .setCustomId(`rr_${r.roleId}`)
                .setLabel(r.label)
                .setStyle(ButtonStyle.Secondary);
            
            if (r.emoji) button.setEmoji(r.emoji);
            
            currentRow.addComponents(button);
        });
        if (currentRow.components.length > 0) actionRows.push(currentRow);

        // Отправляем сообщение в Discord
        const msg = await channel.send({ embeds: [embed], components: actionRows });

        // Сохраняем в базу данных
        await ReactionRole.create({
            guildId: guildId,
            channelId: channelId,
            messageId: msg.id,
            mode: mode,
            roles: roles.map(r => ({ roleId: r.roleId, label: r.label }))
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при отправке. Проверьте права бота в канале.' });
    }
});

app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const adminGuilds = req.user.guilds.filter(guild => {
        const permissions = BigInt(guild.permissions);
        return (permissions & BigInt(0x8)) === BigInt(0x8);
    });
    res.json({ user: req.user, guilds: adminGuilds });
});

app.get('/logout', (req, res) => {
    req.logout(() => { res.redirect('/'); });
});

function startWebServer(botClient) {
    const PORT = process.env.PORT || 3000;
    app.set('botClient', botClient);
    app.listen(PORT, () => {
        console.log(`🌐 Веб-панель запущена на порту ${PORT}`);
    });
}

module.exports = { startWebServer };
