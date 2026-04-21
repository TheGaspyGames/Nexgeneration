'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Muestra la latencia actual del bot y la API de Discord.'),

    async execute(interaction) {
        const sent = await interaction.reply({
            content: '🏓 Calculando ping...',
            fetchReply: true,
        });

        const botLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        // Color según la latencia: verde < 100ms, amarillo < 250ms, rojo >= 250ms
        let color;
        if (botLatency < 100) color = 0x57F287;
        else if (botLatency < 250) color = 0xFEE75C;
        else color = 0xED4245;

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setColor(color)
            .addFields(
                { name: '📡 Latencia del Bot', value: `\`${botLatency}ms\``, inline: true },
                { name: '⚡ API de Discord', value: `\`${apiLatency}ms\``, inline: true },
            )
            .setFooter({ text: 'Nexgeneration Bot' })
            .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
    },
};
