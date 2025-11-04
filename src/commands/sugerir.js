const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/config.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sugerir')
        .setDescription('Envía una sugerencia para el servidor')
        .addStringOption(option =>
            option.setName('sugerencia')
                .setDescription('Tu sugerencia para el servidor')
                .setRequired(true)),

    async execute(interaction) {
        const suggestion = interaction.options.getString('sugerencia');

        // Leer settings persistente si existe
        const settingsPath = path.join(__dirname, '..', '..', 'config', 'settings.json');
        let settings = {};
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { /* ignore */ }

        const channelId = settings.suggestionsChannel || config.suggestionsChannel;
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return interaction.reply({
                content: '❌ El canal de sugerencias no está configurado. Un administrador debe ejecutar `/setsugch` para configurarlo.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📝 Nueva Sugerencia')
            .setDescription(suggestion)
            .addFields(
                { name: 'Autor', value: `${interaction.user.tag}`, inline: true },
                { name: 'Estado', value: '⏳ Pendiente', inline: true },
                { name: 'ID', value: interaction.id, inline: true }
            )
            .setColor(config.embedColor)
            .setTimestamp()
            .setFooter({ text: `ID: ${interaction.user.id}` });

        const message = await channel.send({ embeds: [embed] });
        await message.react('👍');
        await message.react('👎');

        await interaction.reply({
            content: `✅ Tu sugerencia ha sido enviada al canal ${channel}`,
            ephemeral: true
        });
    },
};