const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const buildEmbed = (title, description, color = '#FF5733') => {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rerroll')
        .setDescription('Rerrollear ganadores de un sorteo')
        .addStringOption(option =>
            option.setName('sorteo_id')
                .setDescription('ID del sorteo (mensaje) a rerrollear')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de ganadores a rerrollear (por defecto todos)')
                .setMinValue(1)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const manager = interaction.client.giveawayManager;
        const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
            || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

        const respond = async (payload) => {
            const data = { ...payload, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                return interaction.followUp(data);
            }
            return interaction.reply(data);
        };

        if (!hasPermission) {
            const embed = buildEmbed(
                'No autorizado',
                'Necesitas permisos de Administrador o ManageGuild para usar este comando.',
                '#e74c3c'
            );
            return respond({ embeds: [embed] });
        }

        if (!manager) {
            const embed = buildEmbed(
                'Sistema no disponible',
                'El sistema de sorteos no esta disponible en este momento.',
                '#e74c3c'
            );
            return respond({ embeds: [embed] });
        }

        const giveawayId = interaction.options.getString('sorteo_id');
        const winnersCount = interaction.options.getInteger('cantidad') ?? null;

        try {
            const { giveaway, winners } = await manager.rerollGiveaway({
                giveawayId,
                winnersCount,
                requestedBy: interaction.user.id
            });

            const winnersText = typeof manager.formatWinnerMentions === 'function'
                ? manager.formatWinnerMentions(winners)
                : (winners && winners.length ? winners.map(id => `<@${id}>`).join(', ') : 'Nadie participo');

            const successEmbed = new EmbedBuilder()
                .setTitle('Reroll ejecutado')
                .setColor('#2ecc71')
                .setDescription(`Se eligieron **${winners.length}** nuevo(s) ganador(es) para **${giveaway.prize}**.`)
                .addFields(
                    { name: 'Sorteo ID', value: `\`${giveaway.messageId}\``, inline: true },
                    { name: 'Canal', value: `<#${giveaway.channelId}>`, inline: true },
                    { name: 'Ganadores', value: winnersText, inline: false }
                )
                .setTimestamp();

            await respond({ embeds: [successEmbed] });

            if (typeof interaction.client.log === 'function') {
                const logDescription = `Canal: ${giveaway.channelId}\nInterior: Reroll de ${winners.length} ganador(es) en sorteo ${giveaway.messageId}`;
                interaction.client.log('Sorteo', 'Reroll ejecutado', logDescription, { id: interaction.user.id, tag: interaction.user.tag })
                    .catch(() => null);
            }
        } catch (error) {
            let description;
            switch (error.code) {
                case 'GIVEAWAY_NOT_FOUND':
                    description = 'No se encontro el sorteo solicitado. Verifica el ID o espera a que finalice alguno.';
                    break;
                case 'GIVEAWAY_NOT_ENDED':
                    description = 'El sorteo aun esta activo. Solo se puede rerrollear cuando haya finalizado.';
                    break;
                case 'NO_PARTICIPANTS':
                    description = 'Ese sorteo no tiene participantes registrados.';
                    break;
                case 'INVALID_WINNER_COUNT':
                    description = 'La cantidad de ganadores no es valida.';
                    break;
                case 'INSUFFICIENT_PARTICIPANTS':
                    description = 'No hay suficientes participantes para seleccionar esa cantidad de ganadores.';
                    break;
                case 'CHANNEL_UNAVAILABLE':
                    description = 'No se pudo acceder al canal del sorteo. Revisa los permisos del bot.';
                    break;
                default:
                    description = 'Ocurrio un error inesperado al rerrollear el sorteo.';
                    console.error('Error en /rerroll:', error);
                    break;
            }
            const errorEmbed = buildEmbed('Error al rerrollear', description, '#e74c3c');
            await respond({ embeds: [errorEmbed] });
        }
    },
};
