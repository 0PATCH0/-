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
const GuideSchema = new mongoose.Schema({ 
    guildId: String, 
    name: String, 
    description: String, 
    chapters: [{ 
        title: String, 
        content: String, 
        color: String, 
        author: String,           // ← Новое
        authorImg: String,        // ← Новое
        footer: String,           // ← Новое
        thumbnail: String,        // ← Новое
        imageUrl: String, 
        imageUrls: { type: [String], default: [] }, 
        attachmentUrl: String, 
        attachmentName: String 
    }], 
    date: { type: Date, default: Date.now } 
});


const EventSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    eventChannelId: { type: String, default: null },
    pingRoleId: { type: String, default: null },
    timezoneOffset: { type: Number, default: 3 }
});

const EventSchema = new mongoose.Schema({ 
    guildId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    type: { type: String, default: 'Другое' },
    
    // Флаг, чтобы понимать, как обрабатывать событие
    isRecurring: { type: Boolean, default: false },
    
    // Поля для разового события (только если isRecurring === false)
    date: { type: Number, required: false }, 
    
    // Поля для циклических событий (только если isRecurring === true)
    recurrenceType: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
    recurrenceDays: { type: [Number], default: [] }, // 0-6
    timeOfDay: { type: String, default: '20:00' }, // HH:MM
    
    timezoneOffset: { type: Number, default: 3 },
    creatorId: String,
    lastReminded: { type: String, default: null } // Защита от спама (YYYY-MM-DD)
});

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
    time: { type: Number, required: true }, // Unix timestamp в секундах
    format: { type: Number, default: 1 }, // 1, 2, 3, 5
    channelId: { type: String },
    messageId: { type: String },
    matches: [{
        matchIndex: Number,
        challengerPlayer: { userId: String, name: String },
        opponentPlayer: { userId: String, name: String },
        winner: { type: String, enum: ['challenger', 'opponent', null], default: null }
    }],
    winnerGuildId: { type: String, default: null }
});

const WordleLobbySchema = new mongoose.Schema({
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    hostId: { type: String, required: true },
    messageId: { type: String },
    status: { type: String, enum: ['waiting', 'playing', 'finished'], default: 'waiting' },
    mode: { type: String, enum: ['race', 'coop'], default: 'race' },
    totalRounds: { type: Number, default: 1 },
    currentRound: { type: Number, default: 1 },
    wordLength: { type: Number, default: 5 },
    maxAttempts: { type: Number, default: 6 },
    secretWord: { type: String },
    players: [{
        userId: { type: String },
        name: { type: String },
        attempts: [{ word: String, result: [String] }],
        isWinner: { type: Boolean, default: false },
        finishTime: { type: Number }
    }]
}, { timestamps: true });




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
    WordleLobby: mongoose.model('WordleLobby', WordleLobbySchema),
    PlayerProfile: mongoose.model('PlayerProfile', PlayerProfileSchema),
    EventSettings: mongoose.model('EventSettings', EventSettingsSchema)
};
