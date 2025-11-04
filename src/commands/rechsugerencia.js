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

            // Color rojo para denegada
            try { embed.setColor('#E74C3C'); } catch (e) { /* ignore */ }

            // Asegurar que la imagen del autor esté como thumbnail
            if (sugg.authorAvatar) {
                try { embed.setThumbnail(sugg.authorAvatar); } catch (e) { /* ignore */ }
            }

            // Actualizar campos
            const updatedFields = embed.data.fields.map(f => {
                if (f.name === 'Estado') {
                    return { name: 'Estado', value: '❌ Denegada', inline: true };
                } else if (f.name === 'Votos') {
                    const upvotes = message.reactions.cache.get('👍')?.count || 0;
                    const downvotes = message.reactions.cache.get('👎')?.count || 0;
                    return {
                        name: 'Votos',
                        value: `👍 ${upvotes - 1} | 👎 ${downvotes - 1}`,
                        inline: true
                    };
                }
                return f;
            }).filter(f => f.name !== 'Razón');

            // Añadir razón al final
            updatedFields.push({ name: 'Razón', value: razon, inline: false });
            embed.data.fields = updatedFields;

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
