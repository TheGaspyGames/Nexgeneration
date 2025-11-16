const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Muestra la latencia actual del bot y la API de Discord.'),

    async execute(interaction) {
        const pendingMessage = await interaction.reply({
            content: '🏓 Calculando ping...',
            fetchReply: true,
        });

        const botLatency = pendingMessage.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        await interaction.editReply(
            `🏓 Pong!\n` +
            `Latencia del bot: **${botLatency}ms**\n` +
            `Latencia de la API: **${apiLatency}ms**`
        );
    },
};
