const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Создать красивое голосование с живыми результатами')
        .addStringOption(option => option.setName('вопрос').setDescription('О чём голосуем?').setRequired(true))
        .addStringOption(option => option.setName('вариант1').setDescription('Первый вариант').setRequired(true))
        .addStringOption(option => option.setName('вариант2').setDescription('Второй вариант').setRequired(true))
        .addStringOption(option => option.setName('вариант3').setDescription('Третий вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант4').setDescription('Четвертый вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант5').setDescription('Пятый вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант6').setDescription('Шестой вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант7').setDescription('Седьмой вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант8').setDescription('Восьмой вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант9').setDescription('Девятый вариант').setRequired(false))
        .addStringOption(option => option.setName('вариант10').setDescription('Десятый вариант').setRequired(false))
        .addStringOption(option => option.setName('описание').setDescription('Дополнительный текст').setRequired(false))
        .addStringOption(option => option.setName('картинка').setDescription('Ссылка на картинку (URL)').setRequired(false))
        .addIntegerOption(option => option.setName('время').setDescription('Время в минутах (если не указано, голосование бессрочное)').setRequired(false))
        .addBooleanOption(option => option.setName('анонимно').setDescription('Скрыть имена голосующих?').setRequired(false)),

    async execute(interaction) {
        const question = interaction.options.getString('вопрос');
        const description = interaction.options.getString('описание');
        const image = interaction.options.getString('картинка');
        const timeMinutes = interaction.options.getInteger('время');
        const isAnonymous = interaction.options.getBoolean('анонимно') ?? true; // По умолчанию анонимно

        // Собираем все введенные варианты (до 10)
        const options = [];
        for (let i = 1; i <= 10; i++) {
            const opt = interaction.options.getString(`вариант${i}`);
            if (opt) options.push(opt);
        }

        if (options.length > 10) {
            return interaction.reply({ content: 'Максимум 10 вариантов!', ephemeral: true });
        }

        // Хранилище голосов
        const votes = {};
        options.forEach((_, index) => votes[index] = []);

        // Функция генерации красивого Embed
        function generateEmbed(isEnded = false) {
            const totalVotes = Object.values(votes).reduce((acc, curr) => acc + curr.length, 0);
            
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${question}`)
                .setColor(isEnded ? '#2f3136' : '#5865F2') // Если окончено - серый цвет
                .setFooter({ 
                    text: isEnded ? 'Голосование завершено' : (isAnonymous ? 'Анонимное голосование' : 'Открытое голосование'),
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            if (description) embed.setDescription(description);
            if (image) embed.setImage(image);

            options.forEach((option, index) => {
                const count = votes[index].length;
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                
                // Зеленая шкала (10 делений)
                const filledBlocks = Math.round(percent / 10);
                const emptyBlocks = 10 - filledBlocks;
                const progressBar = '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);

                let fieldValue = `\`${progressBar}\` **${percent}%** • ${count} голосов`;

                // Если не анонимно - добавляем теги пользователей (максимум 10, чтобы не превысить лимит символов)
                if (!isAnonymous && count > 0) {
                    const users = votes[index].slice(0, 10).map(id => `<@${id}>`).join(', ');
                    const extra = count > 10 ? ` и еще ${count - 10}...` : '';
                    fieldValue += `\n👤 ${users}${extra}`;
                }

                embed.addFields({ 
                    name: `${index + 1}. ${option}`, // Минималистичные цифры
                    value: fieldValue, 
                    inline: false 
                });
            });
            return embed;
        }

        // Функция генерации кнопок (разбиваем на ряды по 5 штук)
        function generateButtons(isEnded = false) {
            if (isEnded) return []; // Если голосование окончено, кнопок нет

            const rows = [];
            let currentRow = new ActionRowBuilder();
            
            options.forEach((option, index) => {
                if (index > 0 && index % 5 === 0) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                
                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poll_${index}`)
                        .setLabel(`${index + 1}`) // Только цифра на кнопке
                        .setStyle(ButtonStyle.Secondary)
                );
            });
            
            if (currentRow.components.length > 0) rows.push(currentRow);
            return rows;
        }

        const response = await interaction.reply({ 
            embeds: [generateEmbed()], 
            components: generateButtons(),
            fetchReply: true 
        });

        // Настройка таймера (по умолчанию 24 часа, если не указано иное)
        const timeoutMs = timeMinutes ? timeMinutes * 60 * 1000 : 86400000;

        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: timeoutMs 
        });

        collector.on('collect', async i => {
            const clickedIndex = parseInt(i.customId.split('_')[1]);
            const userId = i.user.id;

            let hasVoted = false;
            for (const key in votes) {
                if (votes[key].includes(userId)) {
                    hasVoted = true;
                    votes[key] = votes[key].filter(id => id !== userId);
                    break;
                }
            }

            if (hasVoted && !votes[clickedIndex].includes(userId)) {
                votes[clickedIndex].push(userId);
            } else if (!hasVoted) {
                votes[clickedIndex].push(userId);
            }

            await i.update({ 
                embeds: [generateEmbed()], 
                components: generateButtons() 
            });
        });

        // Когда время выходит
        collector.on('end', async () => {
            await response.edit({ 
                embeds: [generateEmbed(true)], 
                components: [] // Убираем кнопки
            });
        });
    },
};
