const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    MessageFlags 
} = require('discord.js');
const { PromoCode, UserPromoProgress } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('промокоды')
        .setDescription('Пошаговый ввод промокодов'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. Получаем все активные коды из базы
        const activeCodes = await PromoCode.find({ status: 'active' }).lean();
        if (activeCodes.length === 0) {
            return interaction.editReply({ content: '😕 На данный момент активных промокодов нет. Бот обновит список при появлении новых кодов.' });
        }

        // 2. Получаем прогресс пользователя
        let userProgress = await UserPromoProgress.findOne({ discordId: interaction.user.id });
        if (!userProgress) {
            userProgress = await UserPromoProgress.create({ discordId: interaction.user.id, enteredCodes: [] });
        }

        // 3. Фильтруем коды: оставляем только те, что пользователь не ввел
        const unenteredCodes = activeCodes.filter(c => !userProgress.enteredCodes.includes(c.code));

        if (unenteredCodes.length === 0) {
            return interaction.editReply({ 
                content: '🎉 **Вы ввели все доступные на данный момент промокоды!** Возвращайтесь позже.' 
            });
        }

        // 4. Запускаем процесс пошагового ввода
        await startPromoProcess(interaction, unenteredCodes, userProgress);
    }
};

async function startPromoProcess(interaction, queue, userProgress) {
    let currentIndex = 0;

    function generateEmbed() {
        const currentCodeObj = queue[currentIndex];
        const enteredCount = userProgress.enteredCodes.length;
        const totalCount = queue.length; // Общее количество кодов, которые нужно ввести в этой сессии

        return new EmbedBuilder()
            .setTitle('📜 Ввод промокодов Where Winds Meet')
            .setColor('#d4af37')
            .setDescription(`Вы ввели **${enteredCount}** кодов за всё время.\n\n` +
                            `**Текущий код (${currentIndex + 1} из ${totalCount}):**\n\`\`\`\n${currentCodeObj.code}\n\`\`\`\n` +
                            `Скопируйте его и введите в игре: \`Настройки -> Другое -> Обменять код\``)
            .setFooter({ text: `Награда: ${currentCodeObj.reward}` });
    }

    function generateButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('promo_entered').setLabel('✅ Я ввел этот код').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('promo_skip').setLabel('⏭ Пропустить').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('promo_stop').setLabel('Закрыть').setStyle(ButtonStyle.Danger)
        );
    }

    const response = await interaction.editReply({
        embeds: [generateEmbed()],
        components: [generateButtons()]
    });

    const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 минут

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return;

        if (i.customId === 'promo_stop') {
            collector.stop();
            return i.update({ content: '👋 Вы остановились. При следующем вызове команды бот покажет код, на котором вы остановились.', embeds: [], components: [] });
        }

        if (i.customId === 'promo_entered') {
            const currentCode = queue[currentIndex].code;
            
            if (!userProgress.enteredCodes.includes(currentCode)) {
                userProgress.enteredCodes.push(currentCode);
                await userProgress.save();
            }

            currentIndex++;
            
            if (currentIndex >= queue.length) {
                collector.stop();
                return i.update({ content: '🎉 **Поздравляем! Вы ввели все доступные коды!**', embeds: [], components: [] });
            }
            
            await i.update({ embeds: [generateEmbed()], components: [generateButtons()] });
        }

        if (i.customId === 'promo_skip') {
            currentIndex++;
            if (currentIndex >= queue.length) {
                collector.stop();
                return i.update({ content: 'Вы просмотрели все доступные коды.', embeds: [], components: [] });
            }
            await i.update({ embeds: [generateEmbed()], components: [generateButtons()] });
        }
    });
}
