const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Suggestion } = require('../models/Suggestion');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rechsugerencia')
        .setDescription('Rechazar una sugerencia con motivo')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID de la sugerencia').setRequired(true))
        .addStringOption(opt => opt.setName('razon').setDescription('Razón del rechazo').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const id = interaction.options.getInteger('id');
        const razon = interaction.options.getString('razon');

    const sugg = await Suggestion.findOne({ id: id }).exec();
    if (!sugg) return interaction.reply({ content: `No se encontró la sugerencia con ID ${id}.`, ephemeral: true });
        try {
            const channel = await interaction.guild.channels.fetch(sugg.channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: 'No se encontró el canal de la sugerencia.', ephemeral: true });
            const message = await channel.messages.fetch(sugg.messageId).catch(() => null);
            if (!message) return interaction.reply({ content: 'No se encontró el mensaje de la sugerencia.', ephemeral: true });

            const embed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();

            sugg.status = 'Denegada';
            sugg.reason = razon;
            // Actualizar estado y añadir campo razón (o reemplazar si existe)
            embed.data.fields = embed.data.fields.map(f => f.name === 'Estado' ? { name: 'Estado', value: '❌ Denegada', inline: true } : f);
            // Añadir/actualizar Razón
            const otherFields = embed.data.fields.filter(f => f.name !== 'Razón');
            otherFields.push({ name: 'Razón', value: razon, inline: false });
            embed.data.fields = otherFields;

            // Guardar cambios en MongoDB
            try { await sugg.save(); } catch (e) { console.error('No se pudo guardar sugerencia en MongoDB', e); }

            await message.edit({ embeds: [EmbedBuilder.from(embed)] });
            await interaction.reply({ content: `✅ Sugerencia ${id} rechazada. Razón: ${razon}`, ephemeral: true });
        } catch (e) {
            console.error('Error al rechazar sugerencia:', e);
            return interaction.reply({ content: 'Ocurrió un error al rechazar la sugerencia.', ephemeral: true });
        }
    }
};
