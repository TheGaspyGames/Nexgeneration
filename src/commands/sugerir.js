const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/config.js');
const fs = require('fs');
const path = require('path');
const { Suggestion, getNextSequence } = require('../models/Suggestion');

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

        // Obtener next id desde Mongo (o fallback a file si no está disponible)
        let id;
        try {
            if (getNextSequence) {
                id = await getNextSequence('suggestionId');
            }
        } catch (err) {
            console.error('Error obteniendo next sequence, usando fallback file:', err.message);
        }
        if (!id) {
            // fallback simple: usar timestamp
            id = Date.now();
        }
        const embed = new EmbedBuilder()
            .setTitle('📝 Nueva Sugerencia')
            .setDescription(suggestion)
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .addFields(
                { name: 'Estado', value: '⏳ Pendiente', inline: true },
                { name: 'ID', value: `${id}`, inline: true },
                { name: 'Aprobaciones', value: '0', inline: true }
            )
            .setColor(config.embedColor)
            .setTimestamp()
            .setFooter({ text: `Sugerencia #${id}` });

        const message = await channel.send({ embeds: [embed] });
        await message.react('👍');
        await message.react('👎');

        // Guardar sugerencia en MongoDB si está disponible
        try {
            if (Suggestion) {
                const doc = new Suggestion({
                    id: id,
                    authorId: interaction.user.id,
                    messageId: message.id,
                    channelId: channel.id,
                    content: suggestion,
                    status: 'Pendiente',
                    approvals: 0
                });
                await doc.save();
            }
        } catch (e) {
            console.error('No se pudo guardar sugerencia en MongoDB:', e);
        }

        await interaction.reply({
            content: `✅ Tu sugerencia ha sido enviada al canal ${channel}`,
            ephemeral: true
        });
    },
};