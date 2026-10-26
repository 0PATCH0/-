const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ReactionRole, Settings, Reminder, SentMessage } = require('./models');

const app = express();
app.use(express.json());

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
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- СТРАНИЦЫ ---
app.get('/dashboard', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/manage/:id', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'guild.html')); });
app.get('/manage/:id/reactionroles', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'manage.html')); });
app.get('/manage/:id/reminders', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'reminders.html')); });
app.get('/manage/:id/moderation', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'moderation.html')); });
app.get('/manage/:id/custom', (req, res) => { if (!req.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'custom.html')); });

// --- API БАЗОВЫЕ ---
app.get('/api/user', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const adminGuilds = req.user.guilds.filter(guild => (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8));
    res.json({ user: req.user, guilds: adminGuilds });
});

app.get('/api/guild/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const guild = req.user.guilds.find(g => g.id === req.params.id);
    if (!guild) return res.status(403).json({ error: 'Доступ запрещен' });

    const client = req.app.get('botClient'); 
    const discordGuild = client.guilds.cache.get(req.params.id);
    if (!discordGuild) return res.status(404).json({ error: 'Бот не на сервере' });

    const roles = discordGuild.roles.cache.filter(r => r.id !== discordGuild.id && !r.managed).map(r => ({ id: r.id, name: r.name }));
    res.json({ name: guild.name, roles });
});

// --- API РОЛИ ПО КНОПКАМ ---
app.post('/api/guild/:id/reactionroles', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
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
            if (r.emoji) button.setEmoji(r.emoji);
            currentRow.addComponents(button);
        });
        if (currentRow.components.length > 0) actionRows.push(currentRow);

        const msg = await channel.send({ embeds: [embed], components: actionRows });
        await ReactionRole.create({ guildId: req.params.id, channelId, messageId: msg.id, mode, roles: roles.map(r => ({ roleId: r.roleId, label: r.label })) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при отправке' });
    }
});

// --- API НАПОМИНАНИЯ ---
app.get('/api/guild/:id/reminders', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const channelIds = req.app.get('botClient').channels.cache.filter(c => c.guildId === req.params.id).map(c => c.id);
    const reminders = await Reminder.find({ channelId: { $in: channelIds } });
    res.json(reminders);
});

app.delete('/api/reminders/:reminderId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    await Reminder.deleteOne({ id: req.params.reminderId });
    res.json({ success: true });
});

// --- API МОДЕРАЦИЯ ---
app.get('/api/guild/:id/moderation', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    let settings = await Settings.findOne({ guildId: req.params.id });
    if (!settings) settings = await Settings.create({ guildId: req.params.id, modRoles: [] });
    res.json(settings);
});

app.post('/api/guild/:id/moderation', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const { modRoles } = req.body;
    await Settings.findOneAndUpdate({ guildId: req.params.id }, { modRoles }, { upsert: true });
    res.json({ success: true });
});

// ==========================================
// API EMBED-СООБЩЕНИЯ (УПРАВЛЕНИЕ)
// ==========================================

// Получить список отправленных сообщений
app.get('/api/guild/:id/embeds', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const messages = await SentMessage.find({ guildId: req.params.id });
    res.json(messages);
});

// Создать и отправить сообщение
app.post('/api/guild/:id/embeds', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, color, image, footer, author, channelId } = req.body;
    const client = req.app.get('botClient');

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Канал не найден или бот не имеет прав.' });

        const embed = new EmbedBuilder()
            .setTitle(title || null)
            .setDescription(description || null)
            .setColor(color || '#5865F2');

        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });
        if (author) embed.setAuthor({ name: author });

        const msg = await channel.send({ embeds: [embed] });

        await SentMessage.create({
            guildId: req.params.id, channelId, messageId: msg.id,
            title, description, color, image, footer, author
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при отправке' });
    }
});

// Редактировать сообщение
app.put('/api/guild/:id/embeds/:messageId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, color, image, footer, author } = req.body;
    const client = req.app.get('botClient');
    const { id, messageId } = req.params;

    try {
        const dbMsg = await SentMessage.findOne({ messageId });
        if (!dbMsg) return res.status(404).json({ error: 'Сообщение не найдено в БД' });

        const channel = await client.channels.fetch(dbMsg.channelId).catch(() => null);
        if (!channel) return res.status(400).json({ error: 'Канал не найден' });

        const discordMsg = await channel.messages.fetch(messageId).catch(() => null);
        if (!discordMsg) return res.status(400).json({ error: 'Сообщение было удалено в Discord' });

        const embed = new EmbedBuilder()
            .setTitle(title || null)
            .setDescription(description || null)
            .setColor(color || '#5865F2');

        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });
        if (author) embed.setAuthor({ name: author });

        await discordMsg.edit({ embeds: [embed] });
        
        // Обновляем в БД
        dbMsg.title = title; dbMsg.description = description; dbMsg.color = color;
        dbMsg.image = image; dbMsg.footer = footer; dbMsg.author = author;
        await dbMsg.save();

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при редактировании' });
    }
});

// Удалить сообщение
app.delete('/api/guild/:id/embeds/:messageId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    const client = req.app.get('botClient');
    const { messageId } = req.params;

    try {
        const dbMsg = await SentMessage.findOne({ messageId });
        if (!dbMsg) return res.status(404).json({ error: 'Сообщение не найдено' });

        const channel = await client.channels.fetch(dbMsg.channelId).catch(() => null);
        if (channel) {
            const discordMsg = await channel.messages.fetch(messageId).catch(() => null);
            if (discordMsg) await discordMsg.delete().catch(() => {});
        }

        await SentMessage.deleteOne({ messageId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

function startWebServer(botClient) {
    app.set('botClient', botClient);
    app.listen(process.env.PORT || 3000, () => console.log(`🌐 Веб-панель запущена`));
}

module.exports = { startWebServer };
