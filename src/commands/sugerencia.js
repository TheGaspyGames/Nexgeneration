const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Suggestion } = require('../models/Suggestion');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sugerencia')
        .setDescription('Acciones de moderación sobre una sugerencia')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID de la sugerencia').setRequired(true))
        .addStringOption(opt => opt.setName('accion').setDescription('Acción a realizar').setRequired(true)
            .addChoices(
                { name: 'aprobar', value: 'aprobar' },
                { name: 'implementada', value: 'implementada' }
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const id = interaction.options.getInteger('id');
        const accion = interaction.options.getString('accion');

    // Buscar en MongoDB
    const sugg = await Suggestion.findOne({ id: id }).exec();
    if (!sugg) return interaction.reply({ content: `No se encontró la sugerencia con ID ${id}.`, ephemeral: true });
        try {
            const channel = await interaction.guild.channels.fetch(sugg.channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: 'No se encontró el canal de la sugerencia.', ephemeral: true });
            const message = await channel.messages.fetch(sugg.messageId).catch(() => null);
            if (!message) return interaction.reply({ content: 'No se encontró el mensaje de la sugerencia.', ephemeral: true });

            const embed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();

            if (accion === 'aprobar') {
                sugg.status = 'Aprobada';
                embed.data.fields = embed.data.fields.map(f => f.name === 'Estado' ? { name: 'Estado', value: '✅ Aprobada', inline: true } : f);
            } else if (accion === 'implementada') {
                sugg.status = 'Implementada';
                embed.data.fields = embed.data.fields.map(f => f.name === 'Estado' ? { name: 'Estado', value: '🚀 Implementada', inline: true } : f);
            }

            // Guardar cambios en Mongo
            try { await sugg.save(); } catch (e) { console.error('No se pudo guardar sugerencia en MongoDB', e); }

            await message.edit({ embeds: [EmbedBuilder.from(embed)] });
            await interaction.reply({ content: `✅ Sugerencia ${id} actualizada: ${sugg.status}`, ephemeral: true });
        } catch (e) {
            console.error('Error al procesar sugerencia:', e);
            return interaction.reply({ content: 'Ocurrió un error al procesar la sugerencia.', ephemeral: true });
        }
    }
};
