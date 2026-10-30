const mongoose = require('mongoose');

// --- НАСТРОЙКИ СЕРВЕРА ---
const SettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    modRoles: { type: [String], default: [] }
});

// --- НАПОМИНАНИЯ ---
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

// --- РОЛИ ПО КНОПКАМ ---
const ReactionRoleSchema = new mongoose.Schema({
    guildId: String, 
    channelId: String, 
    messageId: String, 
    title: String, 
    desc: String, 
    color: String, 
    mode: String, 
    roles: [{ roleId: String, label: String, emoji: String }]
});

// --- ЭМБЕД-СООБЩЕНИЯ ---
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

// --- СОСТАВ ГИЛЬДИИ ---
const RosterSchema = new mongoose.Schema({
    guildId: String, 
    lastUpdated: { type: Date, default: Date.now }, 
    data: { type: Object, default: {} }
});

const RosterConfigSchema = new mongoose.Schema({
    guildId: String, 
    columns: [{ roleId: String, name: String, color: { type: String, default: '#5865F2' } }]
});

const RosterMessageSchema = new mongoose.Schema({
    guildId: String, 
    channelId: String, 
    messageId: String
});

// --- ЛОГИ ---
const LogSchema = new mongoose.Schema({
    guildId: String, 
    userId: String, 
    username: String, 
    action: String, 
    details: String, 
    date: { type: Date, default: Date.now }
});

// --- ГАЙДЫ ---
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

// --- СОБЫТИЯ (Рейды/ГВГ) ---
const EventSchema = new mongoose.Schema({
    guildId: String, 
    title: String, 
    description: String, 
    date: Number, // Unix timestamp
    creatorId: String, 
    attendees: [{ type: String }]
});

// --- ПРОФИЛИ ИГРОКОВ (С двумя билдами) ---
const PlayerProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    isGlobal: { type: Boolean, default: false },
    characters: [{
        gameNickname: { type: String, default: '' },
        guildName: { type: String, default: '' },
        roles: { type: [String], default: [] }, 
        martialArts: { type: [String], default: [] }, 
        bio: { type: String, default: '' },
        buildUrl: { type: String, default: '' },
        
        // НОВАЯ СТРУКТУРА: Два независимых билда
        builds: {
            PvE: { 
                innerWays: { type: [String], default: [] }, 
                mysticSkills: { type: [String], default: [] } 
            },
            PvP: { 
                innerWays: { type: [String], default: [] }, 
                mysticSkills: { type: [String], default: [] } 
            }
        }
    }]
});

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
    Event: mongoose.model('Event', EventSchema),
    PlayerProfile: mongoose.model('PlayerProfile', PlayerProfileSchema)
};
