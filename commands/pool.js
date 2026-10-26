const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Создать красивое голосование с живыми результатами')
        .addStringOption(option => option.setName('вопрос').setDescription('О чём голосуем?').setRequired(true))
        .addStringOption(option => option.setName('вариант1').setDescription('Первый вариант').setRequired(true))
        .addStringOption(option => option.setName('вариант2').setDescription('Второй вариант').setRequired(true))
        .addStringOption(option => option.setName('вариант3').setDescription('Третий вариант (необязательно)').setRequired(false))
        .addStringOption(option => option.setName('вариант4').setDescription('Четвертый вариант (необязательно)').setRequired(false))
        .addStringOption(option => option.setName('описание').setDescription('Дополнительный текст').setRequired(false))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку (URL)').setRequired(false)),

    async execute(interaction) {
        const question = interaction.options.getString('вопрос');
        const v1 = interaction.options.getString('вариант1');
        const v2 = interaction.options.getString('вариант2');
        const v3 = interaction.options.getString('вариант3');
        const v4 = interaction.options.getString('вариант4');
        const description = interaction.options.getString('описание');
        const image = interaction.options.getString('картинка');

        const options = [v1, v2, v3, v4].filter(v => v !== null);
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

        // Хранилище голосов (Объект, где ключ - ID кнопки, значение - массив ID пользователей)
        const votes = {};
        options.forEach((_, index) => votes[index] = []);

        // Функция для генерации Embed с актуальными результатами
        function generateEmbed() {
            const totalVotes = Object.values(votes).reduce((acc, curr) => acc + curr.length, 0);
            
            const embed = new EmbedBuilder()
                .setTitle(`📊 Голосование: ${question}`)
                .setColor('#5865F2')
                .setFooter({ text: `Всего голосов: ${totalVotes}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            if (description) embed.setDescription(description);
            if (image) embed.setImage(image);

            options.forEach((option, index) => {
                const count = votes[index].length;
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                
                // Красивая визуальная полоска (10 квадратиков)
                const filledBlocks = Math.round(percent / 10);
                const emptyBlocks = 10 - filledBlocks;
                const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

                embed.addFields({ 
                    name: `${emojis[index]} ${option}`, 
                    value: `\`${progressBar}\` **${percent}%** (${count} голосов)`, 
                    inline: false 
                });
            });
            return embed;
        }

        // Функция для генерации кнопок
        function generateButtons() {
            const buttons = options.map((option, index) => 
                new ButtonBuilder()
                    .setCustomId(`poll_${index}`)
                    .setLabel(option.length > 40 ? option.substring(0, 37) + '...' : option) // Обрезаем слишком длинный текст
                    .setEmoji(emojis[index])
                    .setStyle(ButtonStyle.Secondary)
            );
            return new ActionRowBuilder().addComponents(buttons);
        }

        // Отправляем первоначальное сообщение
        const response = await interaction.reply({ 
            embeds: [generateEmbed()], 
            components: [generateButtons()],
            fetchReply: true 
        });

        // Создаем "сборщик" кликов по кнопкам (работает 24 часа)
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 86400000 
        });

        collector.on('collect', async i => {
            const clickedIndex = parseInt(i.customId.split('_')[1]);
            const userId = i.user.id;

            // Проверяем, голосовал ли уже этот пользователь
            let hasVoted = false;
            for (const key in votes) {
                if (votes[key].includes(userId)) {
                    hasVoted = true;
                    // Удаляем старый голос, если пользователь передумал
                    votes[key] = votes[key].filter(id => id !== userId);
                    break;
                }
            }

            // Если пользователь нажал на тот же вариант, отменяем голос (удаляем)
            if (hasVoted && !votes[clickedIndex].includes(userId)) {
                // Он выбрал другой вариант — добавляем новый голос
                votes[clickedIndex].push(userId);
            } else if (!hasVoted) {
                // Он вообще еще не голосовал
                votes[clickedIndex].push(userId);
            }
            // Если он нажал на тот же вариант, где уже был — голос просто отменяется (удален выше)

            // Обновляем сообщение с новыми результатами
            await i.update({ 
                embeds: [generateEmbed()], 
                components: [generateButtons()] 
            });
        });
    },
};
