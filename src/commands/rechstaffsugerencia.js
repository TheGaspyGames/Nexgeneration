const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../../config/config.js');
const { Suggestion, isMongoConnected } = require('../models/Suggestion');

const staffGuildId = config.staffSuggestionsGuildId;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rechstaffsugerencia')
        .setDescription('Rechaza una sugerencia privada del staff con motivo')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID de la sugerencia').setRequired(true))
        .addStringOption(opt => opt.setName('razon').setDescription('Razón del rechazo').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    allowedGuilds: staffGuildId ? [staffGuildId] : [],
    allowInLogsGuild: true,

    async execute(interaction) {
        if (!staffGuildId || interaction.guildId !== staffGuildId) {
            return interaction.reply({
                content: '⚠️ Este comando solo está disponible dentro del servidor privado del staff.',
                ephemeral: true
            });
        }

        const id = interaction.options.getInteger('id');
        const razon = interaction.options.getString('razon');

        if (!isMongoConnected()) {
            return interaction.reply({ content: '⚠️ La base de datos no está disponible actualmente. Inténtalo más tarde.', ephemeral: true });
        }

        let sugg;
        try {
            sugg = await Suggestion.findOne({ id, scope: 'staff' }).exec();
        } catch (error) {
            console.error('Error consultando sugerencia del staff en MongoDB:', error);
            return interaction.reply({ content: '❌ No se pudo consultar la base de datos de sugerencias del staff. Inténtalo nuevamente más tarde.', ephemeral: true });
        }

        if (!sugg) return interaction.reply({ content: `No se encontró la sugerencia del staff con ID ${id}.`, ephemeral: true });
        try {
            const channel = await interaction.client.resolveChannel(sugg.channelId);
            if (!channel || (staffGuildId && channel.guildId !== staffGuildId)) {
                return interaction.reply({ content: 'No se encontró el canal privado de la sugerencia.', ephemeral: true });
            }
            const message = await channel.messages.fetch(sugg.messageId).catch(() => null);
            if (!message) return interaction.reply({ content: 'No se encontró el mensaje de la sugerencia.', ephemeral: true });

            const embed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();

            sugg.status = 'Denegada';
            sugg.reason = razon;

            try { embed.setColor('#E74C3C'); } catch (e) { /* ignore */ }

            if (sugg.authorAvatar) {
                try { embed.setThumbnail(sugg.authorAvatar); } catch (e) { /* ignore */ }
            }

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

            updatedFields.push({ name: 'Razón', value: razon, inline: false });
            embed.data.fields = updatedFields;

            try { await sugg.save(); } catch (e) { console.error('No se pudo guardar la sugerencia del staff en MongoDB', e); }

            await message.edit({ embeds: [EmbedBuilder.from(embed)] });
            await interaction.reply({ content: `✅ Sugerencia del staff ${id} rechazada. Razón: ${razon}`, ephemeral: true });
        } catch (e) {
            console.error('Error al rechazar la sugerencia del staff:', e);
            return interaction.reply({ content: 'Ocurrió un error al rechazar la sugerencia del staff.', ephemeral: true });
        }
    }
};
