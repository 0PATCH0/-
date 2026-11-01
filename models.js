const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({ 
    guildId: { type: String, required: true, unique: true }, 
    modRoles: { type: [String], default: [] },
    rosterRoleIds: { type: [String], default: [] },
    challengeChannelId: { type: String, default: null } // ← НОВОЕ
});
const ReminderSchema = new mongoose.Schema({ id: { type: String, required: true, unique: true }, userId: String, channelId: String, text: String, targetId: String, targetType: String, repeat: String, nextTime: Number, hour: Number, minute: Number, timezone: Number, warned: { type: Boolean, default: false } });
const ReactionRoleSchema = new mongoose.Schema({ guildId: String, channelId: String, messageId: String, title: String, desc: String, color: String, mode: String, roles: [{ roleId: String, label: String, emoji: String }] });
const SentMessageSchema = new mongoose.Schema({ guildId: String, channelId: String, messageId: String, title: String, description: String, color: String, image: String, footer: String, author: String });
const RosterSchema = new mongoose.Schema({ guildId: String, lastUpdated: { type: Date, default: Date.now }, data: { type: Object, default: {} } });
const RosterConfigSchema = new mongoose.Schema({
    guildId: String,
    columns: [{
        key: { type: String, required: true },
        name: String,
        icon: { type: String, default: 'custom' },
        color: { type: String, default: '#d4af37' },
        order: { type: Number, default: 0 },
        isClass: { type: Boolean, default: false }
    }],
    manualAssignments: { type: Object, default: {} }
});
const RosterMessageSchema = new mongoose.Schema({ guildId: String, channelId: String, messageId: String });
const LogSchema = new mongoose.Schema({ guildId: String, userId: String, username: String, action: String, details: String, date: { type: Date, default: Date.now } });
const GuideSchema = new mongoose.Schema({ guildId: String, name: String, description: String, chapters: [{ title: String, content: String, color: String, imageUrl: String, attachmentUrl: String, attachmentName: String }], date: { type: Date, default: Date.now } });
const EventSchema = new mongoose.Schema({ guildId: String, title: String, description: String, date: Number, creatorId: String, attendees: [{ type: String }] });

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
        builds: {
    PvE: { innerWays: { type: [String], default: [] }, mysticSkills: { type: [String], default: [] }, martialArts: { type: [String], default: [] } },
    PvP: { innerWays: { type: [String], default: [] }, mysticSkills: { type: [String], default: [] }, martialArts: { type: [String], default: [] } }
        }
    }]
});
const ChallengeSchema = new mongoose.Schema({
    challengerGuildId: { type: String, required: true },
    opponentGuildId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'in_progress', 'completed', 'declined'], default: 'pending' },
    time: { type: Number, required: true }, // Unix timestamp
    format: { type: String, default: 'Bo1' }, // Bo1, Bo3, Bo5
    channelId: { type: String }, // Канал, куда бот отправил сообщение
    messageId: { type: String }, // ID сообщения бота
    challengerRoster: [{ userId: String, name: String }],
    opponentRoster: [{ userId: String, name: String }],
    matches: [{
        matchIndex: Number,
        challengerPlayer: { userId: String, name: String },
        opponentPlayer: { userId: String, name: String },
        winner: { type: String, enum: ['challenger', 'opponent', null], default: null }
    }],
    winnerGuildId: { type: String, default: null }
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
    Challenge: mongoose.model('Challenge', ChallengeSchema),
    PlayerProfile: mongoose.model('PlayerProfile', PlayerProfileSchema)
};
