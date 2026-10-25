const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    // Здесь мы настраиваем то, что видит пользователь при вводе "/"
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Создать красивое голосование с живыми результатами')
        .addStringOption(option =>
            option.setName('вопрос')
                .setDescription('О чём голосуем? (Главный вопрос)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('вариант1')
                .setDescription('Первый вариант ответа')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('вариант2')
                .setDescription('Второй вариант ответа')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('вариант3')
                .setDescription('Третий вариант (необязательно)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('вариант4')
                .setDescription('Четвертый вариант (необязательно)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('описание')
                .setDescription('Дополнительный текст к голосованию')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('картинка')
                .setDescription('Ссылка на картинку для оформления (URL)')
                .setRequired(false)),

    // Здесь выполняется сама логика
    async execute(interaction) {
        // Получаем данные, которые ввел пользователь
        const question = interaction.options.getString('вопрос');
        const v1 = interaction.options.getString('вариант1');
        const v2 = interaction.options.getString('вариант2');
        const v3 = interaction.options.getString('вариант3');
        const v4 = interaction.options.getString('вариант4');
        const description = interaction.options.getString('описание');
        const image = interaction.options.getString('картинка');

        // Собираем массив вариантов (убираем пустые)
        const options = [v1, v2, v3, v4].filter(v => v !== null);

        // Настраиваем красивый Embed (встроенное сообщение)
        const embed = new EmbedBuilder()
            .setTitle(`📊 Голосование: ${question}`)
            .setColor('#5865F2') // Фирменный синий цвет Discord
            .setFooter({ text: `Голосование создал ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (description) embed.setDescription(description);
        if (image) embed.setImage(image);

        // Создаем кнопки для каждого варианта
        const buttons = [];
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣']; // Красивые цифры для кнопок

        options.forEach((option, index) => {
            // Добавляем начальные результаты в Embed (0 голосов)
            embed.addFields({ name: `${emojis[index]} ${option}`, value: '`0%` (0 голосов)', inline: false });

            // Создаем кнопку
            const button = new ButtonBuilder()
                .setCustomId(`poll_${index}`) // Уникальный ID для каждой кнопки
                .setLabel(option) // Текст на кнопке
                .setEmoji(emojis[index]) // Эмодзи на кнопке
                .setStyle(ButtonStyle.Secondary); // Серый стиль (в будущем сделаем цветным)
            
            buttons.push(button);
        });

        // Группируем кнопки в ряды (максимум 5 кнопок в ряд)
        const row = new ActionRowBuilder().addComponents(buttons);

        // Отправляем сообщение
        const response = await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            fetchReply: true // Это нужно, чтобы бот видел отправленное сообщение
        });
        
        // Тут в будущем мы добавим сборщик (Collector), который будет считать голоса.
        // Пока что бот просто отправляет красивое сообщение с кнопками.
    },
};
