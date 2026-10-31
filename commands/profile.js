const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { PlayerProfile } = require('../models');
const path = require('path');
const fs = require('fs');

// Безопасная загрузка gamedata.js в Node (без window)
function loadGameDataSafe() {
    try {
        const vm = require('vm');
        const file = path.join(__dirname, '..', 'public', 'js', 'gamedata.js');
        const code = fs.readFileSync(file, 'utf8');
        const sandbox = { window: {}, module: { exports: {} }, console };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox, { timeout: 1000 });
        return sandbox.window.GAME_DATA || sandbox.module.exports || { mysticSkills: [], innerWays: [], martialArts: [] };
    } catch (e) {
        console.error('[PROFILE] Не удалось загрузить gamedata.js:', e.message);
        return { mysticSkills: [], innerWays: [], martialArts: [] };
    }
}
function loadGameMetaSafe() {
    try {
        const vm = require('vm');
        const file = path.join(__dirname, '..', 'public', 'js', 'gamedata_meta.js');
        const code = fs.readFileSync(file, 'utf8');
        const sandbox = { window: {}, module: { exports: {} }, self: {}, console };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox, { timeout: 1000 });
        return sandbox.window.GAME_META || sandbox.module.exports || { mysticSkills: {}, innerWays: {} };
    } catch (e) {
        console.error('[PROFILE] Не удалось загрузить gamedata_meta.js:', e.message);
        return { mysticSkills: {}, innerWays: {} };
    }
}

const GAME_DATA = loadGameDataSafe();
const GAME_META = loadGameMetaSafe();

const RARITY_EMOJI = {
    Legendary: '🌟', Epic: '💜', Rare: '💙', Common: '⚪',
    Offensive: '🔴', General: '🟢', Movement: '🔵'
};

function formatSkill(type, id) {
    const meta = (GAME_META[type === 'mystic' ? 'mysticSkills' : 'innerWays'] || {})[id] || {};
    const list = type === 'mystic' ? GAME_DATA.mysticSkills : GAME_DATA.innerWays;
    const data = (list || []).find(s => s.id === id) || {};
    const name = data.nameRU || data.nameEN || id;
    const emoji = RARITY_EMOJI[meta.rarity] || '⚪';
    let desc = meta.desc || 'Описание отсутствует.';
    if (desc.length > 100) desc = desc.substring(0, 97) + '...';
    return `${emoji} **${name}**\n> *${desc}*`;
}

function formatMartialArts(ids) {
    if (!ids || ids.length === 0) return '*Не выбраны*';
    return ids.map(id => {
        const art = (GAME_DATA.martialArts || []).find(a => a.id === id);
        if (!art) return `\`${id}\``;
        return `${art.emoji || '🥋'} **${art.nameRU}** *(${art.path})*`;
    }).join('\n');
}

function buildBuildEmbed(char, buildType) {
    const build = (char.builds && char.builds[buildType]) || { mysticSkills: [], innerWays: [] };
    const embed = new EmbedBuilder()
        .setTitle(`🎯 ${char.gameNickname || 'Персонаж'} — ${buildType} Билд`)
        .setColor(buildType === 'PvP' ? '#e74c3c' : '#2ecc71')
        .setDescription(`Сборка для режима **${buildType}**`);

    const mysticList = (build.mysticSkills || []).slice(0, 8);
    const innerList = (build.innerWays || []).slice(0, 4);

    embed.addFields(
        { name: '✨ Мистические Навыки', value: mysticList.length ? mysticList.map(id => formatSkill('mystic', id)).join('\n\n') : '*Не выбраны*', inline: false },
        { name: '🧘 Внутренние Пути', value: innerList.length ? innerList.map(id => formatSkill('inner', id)).join('\n\n') : '*Не выбраны*', inline: false }
    );
    return embed;
}

function buildBuildButtons(char, charIndex) {
    const hasPvE = char.builds && char.builds.PvE &&
        ((char.builds.PvE.mysticSkills || []).length > 0 || (char.builds.PvE.innerWays || []).length > 0);
    const hasPvP = char.builds && char.builds.PvP &&
        ((char.builds.PvP.mysticSkills || []).length > 0 || (char.builds.PvP.innerWays || []).length > 0);

    const pveBtn = new ButtonBuilder()
        .setCustomId(`build_PvE_${charIndex}`)
        .setLabel('🌿 PvE')
        .setStyle(hasPvE ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!hasPvE);
    const pvpBtn = new ButtonBuilder()
        .setCustomId(`build_PvP_${charIndex}`)
        .setLabel('⚔️ PvP')
        .setStyle(hasPvP ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(!hasPvP);

    return new ActionRowBuilder().addComponents(pveBtn, pvpBtn);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('профиль')
        .setDescription('Посмотреть игровой профиль')
        .addUserOption(option =>
            option.setName('пользователь')
                .setDescription('Чей профиль посмотреть?')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('пользователь') || interaction.user;
        const guildId = interaction.guild.id;

        let profile = await PlayerProfile.findOne({ userId: targetUser.id, guildId });
        if (!profile || !profile.characters || profile.characters.length === 0) {
            profile = await PlayerProfile.findOne({ userId: targetUser.id, isGlobal: true });
        }
        if (!profile || !profile.characters || profile.characters.length === 0) {
            return interaction.reply({
                content: targetUser.id === interaction.user.id
                    ? '❌ Вы еще не заполнили профиль! Зайдите на сайт.'
                    : `❌ У пользователя <@${targetUser.id}> нет профиля.`,
                ephemeral: true
            });
        }

        const avatarUrl = targetUser.avatar
            ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Профиль ${targetUser.username}`, iconURL: avatarUrl })
            .setColor('#d4af37')
            .setThumbnail(avatarUrl);

        profile.characters.forEach((char, index) => {
            const charTitle = `👤 Персонаж ${index + 1}: ${char.gameNickname || 'Без ника'}`;

            const hasPvE = char.builds && char.builds.PvE &&
                ((char.builds.PvE.mysticSkills || []).length > 0 || (char.builds.PvE.innerWays || []).length > 0);
            const hasPvP = char.builds && char.builds.PvP &&
                ((char.builds.PvP.mysticSkills || []).length > 0 || (char.builds.PvP.innerWays || []).length > 0);
            let buildsText = [];
            if (hasPvE) buildsText.push('🌿 PvE');
            if (hasPvP) buildsText.push('⚔️ PvP');
            const buildsStr = buildsText.length ? buildsText.join(' | ') : 'Билды не настроены';

            let charValue = `🏰 **Гильдия:** ${char.guildName || 'Не указана'}\n`;
            charValue += `🥋 **Боевые искусства:**\n${formatMartialArts(char.martialArts)}\n`;
            charValue += `🎯 **Доступные билды:** ${buildsStr}\n`;
            if (char.bio) charValue += `*"${char.bio}"*`;

            embed.addFields({ name: charTitle, value: charValue, inline: false });
        });

        if (profile.isGlobal) embed.setFooter({ text: '🌐 Глобальный профиль' });

        const rows = [];
        const maxChars = Math.min(profile.characters.length, 3);
        for (let i = 0; i < maxChars; i++) {
            const char = profile.characters[i];
            const row = buildBuildButtons(char, i);
            if (maxChars > 1) {
                const label = (char.gameNickname || `#${i + 1}`).slice(0, 20);
                row.components.forEach(c => c.setLabel(`[${label}] ${c.data.label || ''}`.slice(0, 80)));
            }
            rows.push(row);
        }
        if (rows.length === 0) rows.push(new ActionRowBuilder());

        const response = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
        const collector = response.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Это меню не для вас.', ephemeral: true });
            }
            if (i.customId === 'back_to_profile') {
                return i.update({ embeds: [embed], components: rows });
            }
            const match = i.customId.match(/^build_(PvE|PvP)_(\d+)$/);
            if (!match) return;

            const buildType = match[1];
            const charIndex = parseInt(match[2], 10);
            const char = profile.characters[charIndex];
            if (!char) return i.deferUpdate();

            const hasBuild = char.builds && char.builds[buildType] &&
                ((char.builds[buildType].mysticSkills || []).length > 0 || (char.builds[buildType].innerWays || []).length > 0);
            if (!hasBuild) {
                return i.reply({ content: `У этого персонажа нет сохранённого ${buildType} билда.`, ephemeral: true });
            }

            const buildEmbed = buildBuildEmbed(char, buildType);
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('back_to_profile').setLabel('← Назад к профилю').setStyle(ButtonStyle.Secondary)
            );
            await i.update({ embeds: [buildEmbed], components: [backRow] });
        });
    }
};
