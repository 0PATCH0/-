const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Показать список всех доступных команд бота'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('📚 Руководство по командам бота')
            .setColor('#5865F2')
            .setDescription('Вот список всего, что я умею. Бот сам добавляет сюда новые команды, как только вы их создаете!');

        // Получаем все команды, которые бот загрузил при запуске
        const commands = interaction.client.commands;
        
        commands.forEach(command => {
            embed.addFields({
                name: `/${command.data.name}`,
                value: command.data.description || 'Описание отсутствует',
                inline: false
            });
        });

        embed.setFooter({ text: 'Чтобы посмотреть настройки команды, просто начни вводить её в чате.' });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
