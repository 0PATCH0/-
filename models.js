const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    modRoles: { type: [String], default: [] }
});

const ReminderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: String, channelId: String, text: String, targetId: String, targetType: String, repeat: String, nextTime: Number, hour: Number, minute: Number, timezone: Number, warned: { type: Boolean, default: false }
});

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

const SentMessageSchema = new mongoose.Schema({
    guildId: String, channelId: String, messageId: String, title: String, description: String, color: String, image: String, footer: String, author: String
});

const RosterSchema = new mongoose.Schema({
    guildId: String, lastUpdated: { type: Date, default: Date.now }, data: { type: Object, default: {} }
});

const RosterConfigSchema = new mongoose.Schema({
    guildId: String, columns: [{ roleId: String, name: String, color: { type: String, default: '#5865F2' } }]
});

const RosterMessageSchema = new mongoose.Schema({
    guildId: String, channelId: String, messageId: String
});

const LogSchema = new mongoose.Schema({
    guildId: String, userId: String, username: String, action: String, details: String, date: { type: Date, default: Date.now }
});

const GuideSchema = new mongoose.Schema({
    guildId: String, name: String, description: String, chapters: [{ title: String, content: String, color: String, imageUrl: String, attachmentUrl: String, attachmentName: String }], date: { type: Date, default: Date.now }
});

// ОБНОВЛЕННАЯ МОДЕЛЬ ПРОФИЛЯ (до 3 персонажей, массивы искусств и оружия)
const PlayerProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    isGlobal: { type: Boolean, default: false },
    characters: [{
        gameNickname: { type: String, default: '' },
        guildName: { type: String, default: '' },
        roles: { type: [String], default: [] }, // Теперь массив ролей
        martialArts: { type: [String], default: [] },     
        bio: { type: String, default: '' }
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
    PlayerProfile: mongoose.model('PlayerProfile', PlayerProfileSchema)
};
