const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Suggestion, isMongoConnected } = require('../models/Suggestion');

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

        if (!isMongoConnected()) {
            return interaction.reply({ content: '⚠️ La base de datos no está disponible actualmente. Inténtalo más tarde.', ephemeral: true });
        }

        let sugg;
        try {
            sugg = await Suggestion.findOne({ id: id }).exec();
        } catch (error) {
            console.error('Error consultando sugerencia en MongoDB:', error);
            return interaction.reply({ content: '❌ No se pudo consultar la base de datos de sugerencias. Inténtalo nuevamente más tarde.', ephemeral: true });
        }

        if (!sugg) return interaction.reply({ content: `No se encontró la sugerencia con ID ${id}.`, ephemeral: true });
        try {
            const channel = await interaction.guild.channels.fetch(sugg.channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: 'No se encontró el canal de la sugerencia.', ephemeral: true });
            const message = await channel.messages.fetch(sugg.messageId).catch(() => null);
            if (!message) return interaction.reply({ content: 'No se encontró el mensaje de la sugerencia.', ephemeral: true });

            const embed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();

            if (accion === 'aprobar') {
                sugg.status = 'Aprobada';
                try { embed.setColor('#2ECC71'); } catch (e) { /* ignore */ }
            } else if (accion === 'implementada') {
                sugg.status = 'Implementada';
                try { embed.setColor('#2ECC71'); } catch (e) { /* ignore */ }
            }

            // Asegurar que la imagen del autor esté como thumbnail
            if (sugg.authorAvatar) {
                try { embed.setThumbnail(sugg.authorAvatar); } catch (e) { /* ignore */ }
            }

            // Actualizar estado en el campo correspondiente
            embed.data.fields = embed.data.fields.map(f => {
                if (f.name === 'Estado') {
                    return { 
                        name: 'Estado', 
                        value: accion === 'aprobar' ? '✅ Aprobada' : '🚀 Implementada',
                        inline: true 
                    };
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
            });

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
