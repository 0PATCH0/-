const { EmbedBuilder } = require('discord.js');
const { PlayerProfile, RosterConfig, RosterMessage, Settings } = require('./models');

const BASE_CLASSES = [
    { key: 'dps',    name: 'ДД',   icon: 'dps',    color: '#e74c3c', order: 0, isClass: true, emoji: '<:dd:1564320122708037692>' },
    { key: 'tank',   name: 'Танк', icon: 'tank',   color: '#2ecc71', order: 1, isClass: true, emoji: '<:tank:1564320623507935334>' },
    { key: 'healer', name: 'Хил',  icon: 'healer', color: '#9b59b6', order: 2, isClass: true, emoji: '<:heal:1564320644496363702>' }
];

function detectClassFromMartialArts(martialArts) {
    const map = {
        nameless_sword: 'dps', nameless_spear: 'dps', strategic_sword: 'dps',
        heavenquaker_spear: 'dps', infernal_twinblades: 'dps', mortal_rope_dart: 'dps',
        inkwell_fan: 'dps', vernal_umbrella: 'dps',
        stormbreaker_spear: 'tank', thundercry_blade: 'tank',
        panacea_fan: 'healer', soulshade_umbrella: 'healer'
    };
    const classes = (martialArts || []).map(id => map[id]).filter(Boolean);
    if (classes.length === 0) return null;
    const unique = [...new Set(classes)];
    if (unique.length === 1) return unique[0];
    return 'hybrid';
}

function getDefaultRosterColumns() {
    return BASE_CLASSES.map(c => ({ ...c }));
}

async function buildClassifiedRoster(botClient, guildId) {
    const discordGuild = botClient.guilds.cache.get(guildId);
    if (!discordGuild) {
        console.warn('[ROSTER] Guild not found in cache:', guildId);
        return { columns: [], members: [], guildName: null };
    }

    let config = await RosterConfig.findOne({ guildId });
    let columns;
    if (!config || !config.columns || config.columns.length === 0) {
        columns = getDefaultRosterColumns();
    } else {
        // Сортируем: кастомные сверху, потом базовые классы, внутри — по order
        columns = [...config.columns].sort((a, b) => {
            const aIsClass = a.isClass ? 1 : 0;
            const bIsClass = b.isClass ? 1 : 0;
            if (aIsClass !== bIsClass) return aIsClass - bIsClass;
            return (a.order || 0) - (b.order || 0);
        });
    }
    const manual = (config && config.manualAssignments) || {};

    const profiles = await PlayerProfile.find({
        $or: [ { guildId }, { isGlobal: true } ]
    });
    console.log('[ROSTER] buildClassifiedRoster', guildId, 'profiles found:', profiles.length);

    const profileMap = {};
    profiles.forEach(p => {
        if (!profileMap[p.userId] || p.guildId === guildId) {
            profileMap[p.userId] = p;
        }
    });

    const memberIds = Object.keys(profileMap);
    const fetched = await Promise.all(
        memberIds.map(async (id) => {
            const m = await discordGuild.members.fetch(id).catch((e) => {
                console.error('[ROSTER] fetch failed for', id, '-', e.message);
                return null;
            });
            if (!m) console.warn('[ROSTER] member not found:', id);
            return m;
        })
    );

    const members = [];
    fetched.forEach(m => {
        if (!m || m.user.bot) return;
        const p = profileMap[m.id];
        if (!p) return;
        let detectedClass = null;
        if (p.characters && p.characters.length > 0) {
            const c = p.characters[0];
            const arts = [
                ...((c.builds?.PvE?.martialArts) || []),
                ...((c.builds?.PvP?.martialArts) || [])
            ];
            detectedClass = detectClassFromMartialArts(arts);
        }
        members.push({
            userId: m.id,
            displayName: m.displayName,
            avatar: m.user.avatar
                ? `https://cdn.discordapp.com/avatars/${m.id}/${m.user.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/0.png`,
            detectedClass: detectedClass || 'none',
            manualColumnKey: manual[m.id] || null
        });
    });

    console.log('[ROSTER] buildClassifiedRoster', guildId, 'members after fetch:', members.length);

    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { columns, members, guildName: discordGuild.name };
}

function buildRosterEmbeds(roster, guildId) {
    const { columns, members, guildName } = roster;

    // Группировка по ключам колонок
    const byColumn = {};
    columns.forEach(c => { byColumn[c.key] = []; });

    members.forEach(m => {
        if (m.manualColumnKey && byColumn[m.manualColumnKey]) {
            byColumn[m.manualColumnKey].push(m);
            return;
        }
        if (m.detectedClass === 'hybrid') {
            if (byColumn.dps) byColumn.dps.push(m);
            if (byColumn.tank) byColumn.tank.push(m);
            if (byColumn.healer) byColumn.healer.push(m);
            return;
        }
        if (byColumn[m.detectedClass]) {
            byColumn[m.detectedClass].push(m);
        }
    });

    console.log('[ROSTER] byColumn:', Object.keys(byColumn).map(k => k + ':' + byColumn[k].length).join(', '));

    const profileUrl = (userId) => `https://patchitos1234.fly.dev/view-profile/${userId}?guild=${guildId}`;

    const embeds = [];
    let currentEmbed = new EmbedBuilder()
        .setTitle(`🛡️ Состав гильдии — ${guildName || 'Сервер'}`)
        .setColor('#d4af37')
        .setFooter({ text: `Всего: ${members.length}` })
        .setTimestamp();

    let currentFieldCount = 0;
    const MAX_FIELDS = 25;

    // columns УЖЕ отсортированы в buildClassifiedRoster. Не сортируем повторно.
    for (const col of columns) {
        const list = byColumn[col.key] || [];
        console.log('[ROSTER] col:', col.key, '| list length:', list.length);

        if (list.length === 0) continue;

        let emoji;
        if (col.isClass) {
            const base = BASE_CLASSES.find(b => b.key === col.key);
            emoji = base ? base.emoji : '◆';
        } else {
            emoji = col.emoji || '⚙️';
        }

        let value = list.map(m => `• <@${m.userId}> — [👁 Профиль](${profileUrl(m.userId)})`).join('\n');
        if (value.length > 1020) value = value.substring(0, 1017) + '...';

        if (currentFieldCount >= MAX_FIELDS) {
            embeds.push(currentEmbed);
            currentEmbed = new EmbedBuilder().setColor('#d4af37');
            currentFieldCount = 0;
        }

        currentEmbed.addFields({
            name: `${emoji} ${col.name} (${list.length})`,
            value,
            inline: false
        });
        currentFieldCount++;
    }

    // Участники, не попавшие ни в одну колонку
    const orphans = members.filter(m => {
        if (m.manualColumnKey && byColumn[m.manualColumnKey] && byColumn[m.manualColumnKey].includes(m)) return false;
        if (m.detectedClass === 'hybrid' && (
            (byColumn.dps && byColumn.dps.includes(m)) ||
            (byColumn.tank && byColumn.tank.includes(m)) ||
            (byColumn.healer && byColumn.healer.includes(m))
        )) return false;
        if (byColumn[m.detectedClass] && byColumn[m.detectedClass].includes(m)) return false;
        return true;
    });

    if (orphans.length > 0) {
        let value = orphans.map(m => `• <@${m.userId}> — [👁 Профиль](${profileUrl(m.userId)})`).join('\n');
        if (value.length > 1020) value = value.substring(0, 1017) + '...';
        if (currentFieldCount >= MAX_FIELDS) {
            embeds.push(currentEmbed);
            currentEmbed = new EmbedBuilder().setColor('#d4af37');
            currentFieldCount = 0;
        }
        currentEmbed.addFields({
            name: `◆ Без класса (${orphans.length})`,
            value,
            inline: false
        });
        currentFieldCount++;
    }

    if (currentFieldCount > 0 || embeds.length === 0) {
        if (members.length === 0) {
            currentEmbed.setDescription('*Пока нет участников с профилями.*');
        }
        embeds.push(currentEmbed);
    }

    console.log('[ROSTER] buildRosterEmbeds: embeds=' + embeds.length + ', fields total=' + embeds.reduce((s, e) => s + (e.data.fields || []).length, 0));

    return embeds.slice(0, 10);
}

// Троттлинг: 5 секунд
const pendingRefreshes = new Map();

function refreshRosterMessage(botClient, guildId) {
    if (pendingRefreshes.has(guildId)) {
        clearTimeout(pendingRefreshes.get(guildId).timeout);
    }
    const timeout = setTimeout(async () => {
        pendingRefreshes.delete(guildId);
        try {
            await _doRefresh(botClient, guildId);
        } catch (e) {
            console.error('[ROSTER REFRESH]', guildId, e.message);
        }
    }, 5000);
    pendingRefreshes.set(guildId, { timeout });
}

async function _doRefresh(botClient, guildId) {
    console.log('[ROSTER REFRESH] start for', guildId);
    const roster = await buildClassifiedRoster(botClient, guildId);
    const embeds = buildRosterEmbeds(roster, guildId);

    const records = await RosterMessage.find({ guildId });
    console.log('[ROSTER REFRESH] RosterMessage records:', records.length);

    if (records.length === 0) return;

    for (const rec of records) {
        try {
            const channel = await botClient.channels.fetch(rec.channelId).catch(() => null);
            if (!channel) {
                console.warn('[ROSTER REFRESH] channel not found:', rec.channelId);
                continue;
            }
            const message = await channel.messages.fetch(rec.messageId).catch(() => null);
            if (!message) {
                console.warn('[ROSTER REFRESH] message not found:', rec.messageId);
                await RosterMessage.deleteOne({ _id: rec._id });
                continue;
            }
            await message.edit({ embeds });
            console.log('[ROSTER REFRESH] message edited:', rec.messageId);
        } catch (e) {
            console.error('[ROSTER REFRESH MSG]', e.message);
        }
    }
}

module.exports = {
    buildClassifiedRoster,
    buildRosterEmbeds,
    refreshRosterMessage,
    detectClassFromMartialArts,
    getDefaultRosterColumns,
    BASE_CLASSES
};
