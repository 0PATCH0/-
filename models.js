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

// НОВАЯ СХЕМА ДЛЯ РОЛЕЙ ПО КНОПКАМ
const ReactionRoleSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    messageId: String,
    mode: String, // 'single' или 'multiple'
    roles: [{
        roleId: String,
        label: String
    }]
});

module.exports = {
    Settings: mongoose.model('Settings', SettingsSchema),
    Reminder: mongoose.model('Reminder', ReminderSchema),
    ReactionRole: mongoose.model('ReactionRole', ReactionRoleSchema) // Экспортируем
};
