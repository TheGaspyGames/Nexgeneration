const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const buildEmbed = (title, description, color = '#FF5733') => {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sorteoexp')
        .setDescription('Expulsar a un usuario de un sorteo')
        .addStringOption(option =>
            option.setName('sorteo_id')
                .setDescription('ID del sorteo (mensaje). Si no se envia, se usa el sorteo activo mas reciente.')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a expulsar del sorteo')
                .setRequired(true))
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
        const targetUser = interaction.options.getUser('usuario');

        try {
            const { giveaway, channel } = await manager.expelParticipantFromGiveaway({
                giveawayId,
                userId: targetUser.id
            });

            const remaining = giveaway.participants ? giveaway.participants.size : 0;
            const successEmbed = new EmbedBuilder()
                .setTitle('Usuario expulsado del sorteo')
                .setColor('#e67e22')
                .setDescription(`Se removio a ${targetUser} del sorteo de **${giveaway.prize}**.`)
                .addFields(
                    { name: 'Sorteo ID', value: `\`${giveaway.messageId}\``, inline: true },
                    { name: 'Canal', value: `<#${giveaway.channelId}>`, inline: true },
                    { name: 'Participantes restantes', value: `${remaining}`, inline: true }
                )
                .setTimestamp();

            await respond({ embeds: [successEmbed] });

            const notifyChannel = channel || await interaction.client.resolveChannel(giveaway.channelId);
            if (notifyChannel) {
                const notifyEmbed = new EmbedBuilder()
                    .setTitle('Participante expulsado')
                    .setColor('#e67e22')
                    .setDescription(`${targetUser} fue removido del sorteo por ${interaction.user}.`)
                    .setTimestamp();

                await notifyChannel.send({
                    embeds: [notifyEmbed],
                    allowedMentions: { users: [] }
                }).catch(() => null);
            }

            if (typeof interaction.client.log === 'function') {
                const logDescription = `Canal: ${giveaway.channelId}\nInterior: Expulsion de ${targetUser.tag} (${targetUser.id}) del sorteo ${giveaway.messageId}`;
                interaction.client.log('Sorteo', 'Expulsion de sorteo', logDescription, { id: interaction.user.id, tag: interaction.user.tag })
                    .catch(() => null);
            }
        } catch (error) {
            let description;
            switch (error.code) {
                case 'GIVEAWAY_NOT_FOUND':
                    description = 'No se encontro el sorteo solicitado o no hay sorteos activos.';
                    break;
                case 'GIVEAWAY_ENDED':
                    description = 'El sorteo ya finalizo; no se pueden expulsar participantes.';
                    break;
                case 'USER_NOT_IN_GIVEAWAY':
                    description = 'El usuario indicado no esta participando en este sorteo.';
                    break;
                case 'USER_REQUIRED':
                    description = 'Debes indicar un usuario valido para expulsar.';
                    break;
                default:
                    description = 'Ocurrio un error inesperado al expulsar al usuario del sorteo.';
                    console.error('Error en /sorteoexp:', error);
                    break;
            }

            const errorEmbed = buildEmbed('Error al expulsar', description, '#e74c3c');
            await respond({ embeds: [errorEmbed] });
        }
    },
};
