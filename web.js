const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');

const app = express();

// Настройка сессий (чтобы сайт запоминал, что ты вошел)
app.use(session({
    secret: 'super_secret_bot_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // для локальной разработки
}));

app.use(passport.initialize());
app.use(passport.session());

// Статические файлы (наш HTML)
app.use(express.static(path.join(__dirname, 'public')));

// === НАСТРОЙКА СТРАТЕГИИ DISCORD ===
passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET, // Нам понадобится добавить это в Render!
    callbackURL: 'https://discord-bot-24oz.onrender.com/auth/discord/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    // Сохраняем профиль пользователя в сессию
    return done(null, profile);
}));

// Сохранение и чтение пользователя из сессии
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Роуты для входа
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => { res.redirect('/dashboard'); }
);

// Страница Dashboard (пока заглушка)
app.get('/dashboard', (req, res) => {
    if (!req.user) return res.redirect('/'); // Если не вошел - на главную
    res.send(`
        <h1>Привет, ${req.user.username}!</h1>
        <p>Ты успешно вошел. Скоро здесь будет панель управления.</p>
        <a href="/">На главную</a>
    `);
});

// Функция для запуска сайта (мы вызовем её из index.js)
function startWebServer() {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Веб-панель запущена на порту ${PORT}`);
    });
}

module.exports = { startWebServer };
