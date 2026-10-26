const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Показать подробную информацию о сервере'),

    async execute(interaction) {
        const { guild } = interaction;

        // Получаем владельца сервера
        const owner = await guild.fetchOwner();

        const embed = new EmbedBuilder()
            .setTitle(`🏰 Информация о сервере: ${guild.name}`)
            .setColor('#5865F2')
            .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 })) // Аватарка сервера
            .addFields(
                { name: '👑 Владелец', value: `${owner.user.tag}`, inline: true },
                { name: '🆔 ID сервера', value: guild.id, inline: true },
                { name: '📅 Создан', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                
                { name: '👥 Участники', value: `${guild.memberCount}`, inline: true },
                { name: '💎 Бусты', value: `Уровень ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} бустов)`, inline: true },
                { name: '📁 Каналы', value: `${guild.channels.cache.size}`, inline: true }
            )
            .setFooter({ text: `Запросил ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
