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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guides = await Guide.find({ guildId: interaction.guild.id }).sort({ date: -1 });

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

            // Скрываем меню, чтобы не мешало
            await i.update({ content: '⏳ Загрузка гайда...', components: [] });

            if (selectedGuide.chapters.length === 0) {
                return i.editReply({ content: 'В этом гайде пока нет глав.' });
            }

            // Discord позволяет максимум 10 эмбедов в одном сообщении
            // Разбиваем главы на пачки по 10
            const chunks = [];
            for (let c = 0; c < selectedGuide.chapters.length; c += 10) {
                chunks.push(selectedGuide.chapters.slice(c, c + 10));
            }

            // Отправляем скрытые сообщения
            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];
                const embeds = [];
                const allComponents = [];

                for (const ch of chunk) {
                    const embed = new EmbedBuilder()
                        .setTitle(ch.title || 'Без названия')
                        .setDescription(ch.content ? ch.content.substring(0, 4000) : '*Пустая глава*')
                        .setColor(ch.color || '#d4af37');

                    if (ch.author) {
                        embed.setAuthor({ 
                            name: ch.author, 
                            iconURL: ch.authorImg || undefined 
                        });
                    }

                    if (ch.footer) {
                        embed.setFooter({ text: ch.footer });
                    }

                    if (ch.thumbnail) {
                        try { embed.setThumbnail(ch.thumbnail); } catch (e) {}
                    }

                    if (ch.imageUrls && ch.imageUrls.length > 0) {
                        try { embed.setImage(ch.imageUrls[0]); } catch (e) {}
                    } else if (ch.imageUrl) {
                        try { embed.setImage(ch.imageUrl); } catch (e) {}
                    }

                    if (ch.attachmentUrl) {
                        const btn = new ButtonBuilder()
                            .setLabel(ch.attachmentName || '📄 Скачать вложение')
                            .setURL(ch.attachmentUrl)
                            .setStyle(ButtonStyle.Link);
                        allComponents.push(new ActionRowBuilder().addComponents(btn));
                    }

                    embeds.push(embed);
                }

                // Отправляем как скрытое сообщение (видит только вызвавший)
                await i.followUp({ 
                    embeds: embeds, 
                    components: allComponents.slice(0, 5), // Discord разрешает максимум 5 рядов с кнопками
                    flags: MessageFlags.Ephemeral 
                });
            }
        });
    },
};
