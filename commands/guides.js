const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    MessageFlags
} = require('discord.js');
const { Guide } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('гайды')
        .setDescription('Посмотреть список гайдов сервера'),

    async execute(interaction) {
        // Используем MessageFlags для скрытого сообщения
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guides = await Guide.find({ guildId: interaction.guild.id });

        if (guides.length === 0) {
            return interaction.editReply({ content: 'На этом сервере пока нет гайдов. Администраторы могут добавить их на сайте.' });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_guide')
            .setPlaceholder('Выберите гайд для чтения')
            .addOptions(guides.slice(0, 25).map(g => ({
                label: g.name.substring(0, 100),
                description: g.description ? g.description.substring(0, 100) : 'Без описания',
                value: g._id.toString(),
                emoji: '📖'
            })));

        const row = new ActionRowBuilder().addComponents(menu);

        const response = await interaction.editReply({
            content: '📚 **Выберите гайд из списка ниже:**',
            components: [row]
        });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Это меню открыто не вами.', flags: MessageFlags.Ephemeral });
            }

            const guideId = i.values[0];
            const selectedGuide = await Guide.findById(guideId);

            if (!selectedGuide) {
                return i.update({ content: 'Гайд не найден или был удален.', components: [] });
            }

            await i.update({ content: `✅ Гайд **${selectedGuide.name}** отправлен в чат!`, components: [] });

            // Отправляем каждую главу отдельным сообщением
            if (selectedGuide.chapters.length === 0) {
                return interaction.channel.send({ content: 'В этом гайде пока нет глав.' });
            }

            for (const ch of selectedGuide.chapters) {
                const embed = new EmbedBuilder()
                    .setTitle(ch.title || 'Без названия')
                    .setDescription(ch.content ? ch.content.substring(0, 4000) : '*Пустая глава*')
                    .setColor(ch.color || '#d4af37');
                
                if (ch.imageUrl) {
                    // Проверка на валидность URL картинки
                    try { embed.setImage(ch.imageUrl); } catch (e) {}
                }

                const components = [];
                if (ch.attachmentUrl) {
                    const btn = new ButtonBuilder()
                        .setLabel(ch.attachmentName || '📄 Скачать вложение')
                        .setURL(ch.attachmentUrl)
                        .setStyle(ButtonStyle.Link);
                    components.push(new ActionRowBuilder().addComponents(btn));
                }

                await interaction.channel.send({ embeds: [embed], components: components });
            }
        });
    },
};
