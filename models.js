const mongoose = require('mongoose');

// Схема для настроек сервера (роли модераторов)
const SettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    modRoles: { type: [String], default: [] }
});

// Схема для напоминаний
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

module.exports = {
    Settings: mongoose.model('Settings', SettingsSchema),
    Reminder: mongoose.model('Reminder', ReminderSchema)
};
