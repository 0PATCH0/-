const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');

const app = express();

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

// Отдаем HTML-файл дашборда (если не авторизован - на главную)
app.get('/dashboard', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API для получения данных пользователя и списка серверов
app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });

    // Фильтруем серверы: оставляем только те, где у пользователя есть права Администратора (бит 0x8)
    const adminGuilds = req.user.guilds.filter(guild => {
        const permissions = BigInt(guild.permissions);
        return (permissions & BigInt(0x8)) === BigInt(0x8);
    });

    res.json({
        user: req.user,
        guilds: adminGuilds
    });
});

app.get('/manage/:id', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'guild.html'));
});

// Отдаем HTML-файл управления сервером
app.get('/manage/:id/reactionroles', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

// API: Получить название сервера и список ролей
app.get('/api/guild/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    // Проверяем, есть ли у пользователя доступ к этому серверу
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: 'Доступ запрещен' });

    // Получаем роли сервера через бота (он уже запущен)
    // Примечание: Мы получим клиента бота позже, для этого передадим его в функцию
    const client = req.app.get('botClient'); 
    const discordGuild = client.guilds.cache.get(req.params.id);
    
    if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });

    // Фильтруем роли (убираем @everyone и роли ботов)
    const roles = discordGuild.roles.cache
        .filter(r => r.id !== discordGuild.id && !r.managed)
        .map(r => ({ id: r.id, name: r.name }));

    res.json({ name: guild.name, roles });
});

// API: Сохранить настройки и отправить сообщение в Discord
app.post('/api/guild/:id/reactionroles', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    
    const { title, desc, color, channelId, mode, roles } = req.body;
    const guildId = req.params.id;
    const client = req.app.get('botClient');

    try {
        // Здесь мы должны сохранить настройки в MongoDB (сделаем это позже)
        // А пока просто отправим красивое сообщение в указанный канал.

        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(400).json({ error: 'Канал не найден' });

        // Здесь будет код отправки Embed и кнопок в Discord
        // (Мы напишем его на следующем шаге)

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при отправке в Discord' });
    }
});

// Выход
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

function startWebServer(botClient) {
    const PORT = process.env.PORT || 3000;
    app.set('botClient', botClient); // Передаем бота в Express
    app.listen(PORT, () => {
        console.log(`🌐 Веб-панель запущена на порту ${PORT}`);
    });
}

module.exports = { startWebServer };
