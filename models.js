const mongoose = require('mongoose');

// Схема настроек сервера
const SettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    modRoles: { type: [String], default: [] }
});

// Схема напоминаний
const ReminderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: String, 
    channelId: String, 
    text: String, 
    targetId: String, 
    targetType: String, 
    repeat: String, 
    nextTime: Number, 
    hour: Number, 
    minute: Number, 
    timezone: Number, 
    warned: { type: Boolean, default: false }
});

// Схема ролей по кнопкам
const ReactionRoleSchema = new mongoose.Schema({
    guildId: String, 
    channelId: String, 
    messageId: String, 
    mode: String, 
    roles: [{ roleId: String, label: String }]
});

// Схема отправленных сообщений (Эмбеды)
const SentMessageSchema = new mongoose.Schema({
    guildId: String, 
    channelId: String, 
    messageId: String, 
    title: String, 
    description: String, 
    color: String, 
    image: String, 
    footer: String, 
    author: String
});

// Схема состава гильдии
const RosterSchema = new mongoose.Schema({
    guildId: String, 
    lastUpdated: { type: Date, default: Date.now }, 
    data: { type: Object, default: {} }
});

// Схема настроек колонок для состава
const RosterConfigSchema = new mongoose.Schema({
    guildId: String, 
    columns: [{ roleId: String, name: String, color: { type: String, default: '#5865F2' } }]
});

// Схема сообщений со списком (чтобы бот знал, что обновлять)
const RosterMessageSchema = new mongoose.Schema({
    guildId: String, 
    channelId: String, 
    messageId: String
});

// Схема логов действий
const LogSchema = new mongoose.Schema({
    guildId: String, 
    userId: String, 
    username: String, 
    action: String, 
    details: String, 
    date: { type: Date, default: Date.now }
});

// Схема гайдов
const GuideSchema = new mongoose.Schema({
    guildId: String, 
    name: String, 
    description: String, 
    chapters: [{ 
        title: String, 
        content: String, 
        color: String, 
        imageUrl: String, 
        attachmentUrl: String, 
        attachmentName: String 
    }], 
    date: { type: Date, default: Date.now }
});

// ОБНОВЛЕННАЯ МОДЕЛЬ ПРОФИЛЯ (ИСПРАВЛЕНА ОШИБКА С ИНДЕКСОМ)
const PlayerProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true }, // Привязка к серверу
    isGlobal: { type: Boolean, default: false }, // Глобальный профиль (виден везде)
    characters: [{
        gameNickname: { type: String, default: '' },
        guildName: { type: String, default: '' },
        classRole: { type: String, default: '' },
        weapon: { type: String, default: '' },
        bio: { type: String, default: '' }
    }]
});

// Экспорт всех моделей
module.exports = {
    Settings: mongoose.model('Settings', SettingsSchema),
    Reminder: mongoose.model('Reminder', ReminderSchema),
    ReactionRole: mongoose.model('ReactionRole', ReactionRoleSchema),
    SentMessage: mongoose.model('SentMessage', SentMessageSchema),
    Roster: mongoose.model('Roster', RosterSchema),
    RosterConfig: mongoose.model('RosterConfig', RosterConfigSchema),
    RosterMessage: mongoose.model('RosterMessage', RosterMessageSchema),
    Log: mongoose.model('Log', LogSchema),
    Guide: mongoose.model('Guide', GuideSchema),
    PlayerProfile: mongoose.model('PlayerProfile', PlayerProfileSchema)
};
