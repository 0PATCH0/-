const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('юзер')
        .setDescription('Показать информацию о пользователе')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('О ком показать информацию?')
                .setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('пользователь') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        // Получаем роли (исключаем роль @everyone)
        const roles = member.roles.cache
            .filter(r => r.id !== interaction.guild.id)
            .map(r => `<@&${r.id}>`)
            .join(', ') || 'Нет ролей';

        const embed = new EmbedBuilder()
            .setTitle(`👤 Информация: ${user.username}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setColor(member.displayHexColor || '#5865F2')
            .addFields(
                { name: '🆔 ID', value: user.id, inline: true },
                { name: '📅 Аккаунт создан', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
                { name: '📥 Зашел на сервер', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
                { name: `🎭 Роли (${member.roles.cache.size - 1})`, value: roles, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
