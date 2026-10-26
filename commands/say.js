const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сказать')
        .setDescription('Отправить сообщение от лица бота (в виде красивого Embеда)')
        .addStringOption(option => 
            option.setName('текст')
                .setDescription('Текст вашего объявления')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('картинка')
                .setDescription('Ссылка на картинку для оформления (необязательно)')
                .setRequired(false))
        // Ограничиваем доступ только для тех, у кого есть право "Управлять сообщениями"
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const text = interaction.options.getString('текст');
        const image = interaction.options.getString('картинка');

        const embed = new EmbedBuilder()
            .setTitle('📢 Объявление')
            .setDescription(text)
            .setColor('#FEE75C') // Приятный желтый цвет
            .setFooter({ text: `Сообщение от ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        // Если пользователь прикрепил картинку — добавляем её в Embed
        if (image) {
            embed.setImage(image);
        }

        // Отправляем Embed в текущий канал
        await interaction.channel.send({ embeds: [embed] });

        // Отвечаем пользователю, что всё отправлено (сообщение видит только он)
        await interaction.reply({ content: '✅ Объявление успешно отправлено!', ephemeral: true });
    },
};
