const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    modRoles: { type: [String], default: [] }
});

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

const ReactionRoleSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    messageId: String,
    mode: String,
    roles: [{ roleId: String, label: String }]
});

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

// НОВАЯ МОДЕЛЬ: Сохраненный состав гильдии
const RosterSchema = new mongoose.Schema({
    guildId: String,
    lastUpdated: { type: Date, default: Date.now },
    data: { type: Object, default: {} } // Здесь будем хранить готовые колонки и участников
});

module.exports = {
    Settings: mongoose.model('Settings', SettingsSchema),
    Reminder: mongoose.model('Reminder', ReminderSchema),
    ReactionRole: mongoose.model('ReactionRole', ReactionRoleSchema),
    SentMessage: mongoose.model('SentMessage', SentMessageSchema),
    Roster: mongoose.model('Roster', RosterSchema)
};
