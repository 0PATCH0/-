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
    guildId: String, channelId: String, messageId: String, mode: String, roles: [{ roleId: String, label: String }]
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

// Хранит ID сообщений (может быть несколько в разных каналах)
const RosterMessageSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    messageId: String
});

module.exports = {
    Settings: mongoose.model('Settings', SettingsSchema),
    Reminder: mongoose.model('Reminder', ReminderSchema),
    ReactionRole: mongoose.model('ReactionRole', ReactionRoleSchema),
    SentMessage: mongoose.model('SentMessage', SentMessageSchema),
    Roster: mongoose.model('Roster', RosterSchema),
    RosterConfig: mongoose.model('RosterConfig', RosterConfigSchema),
    RosterMessage: mongoose.model('RosterMessage', RosterMessageSchema)
};
