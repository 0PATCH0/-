const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { Guide } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('гайды')
        .setDescription('Посмотреть список гайдов сервера'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guides = await Guide.find({ guildId: interaction.guild.id });

        if (guides.length === 0) {
            return interaction.editReply({ content: 'На этом сервере пока нет гайдов. Администраторы могут добавить их на сайте.' });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_guide')
            .setPlaceholder('Выберите гайд для чтения')
            .addOptions(guides.slice(0, 25).map(g => ({
                label: g.name,
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
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Это меню не для вас.', ephemeral: true });

            const guideId = i.values[0];
            const selectedGuide = await Guide.findById(guideId);

            if (!selectedGuide) {
                return i.update({ content: 'Гайд не найден или был удален.', components: [] });
            }

            await i.update({ content: `✅ Гайд **${selectedGuide.name}** отправлен в чат!`, components: [] });

            // Отправляем каждую главу отдельным сообщением
            for (const ch of selectedGuide.chapters) {
                const embed = new EmbedBuilder()
                    .setTitle(ch.title || 'Без названия')
                    .setDescription(ch.content || 'Пусто')
                    .setColor(ch.color || '#d4af37');
                
                if (ch.imageUrl) embed.setImage(ch.imageUrl);

                const components = [];
                // Если есть ссылка на файл, создаем красивую кнопку
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
