const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sorteo')
        .setDescription('Crea un nuevo sorteo')
        .addStringOption(option =>
            option.setName('premio')
                .setDescription('¿Qué quieres sortear?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duracion')
                .setDescription('Duración del sorteo (30s, 1m, 1h, 1d)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('ganadores')
                .setDescription('Número de ganadores')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde se realizará el sorteo')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('host')
                .setDescription('Usuario que será mostrado como host del sorteo (opcional)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('rol_requerido')
                .setDescription('Rol requerido para poder participar (opcional)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('mensajes_minimos')
                .setDescription('Cantidad mínima de mensajes necesarios para participar (0 para desactivar)')
                .setMinValue(0)
                .setMaxValue(1000))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const prize = interaction.options.getString('premio');
        const duration = interaction.options.getString('duracion');
        const winners = interaction.options.getInteger('ganadores');
        const channel = interaction.options.getChannel('canal');
        const minMessages = interaction.options.getInteger('mensajes_minimos') || 0;
        const requiredRole = interaction.options.getRole('rol_requerido') || null;
        const hostOption = interaction.options.getUser('host') || null;

        try {
            const giveaway = await interaction.client.giveawayManager.createGiveaway({
                channelId: channel.id,
                duration,
                winners,
                prize,
                host: hostOption || interaction.user,
                minMessages,
                requiredRole: requiredRole ? requiredRole.id : null
            });

            if (giveaway) {
                await interaction.reply({
                    content: `✅ ¡Sorteo creado exitosamente en ${channel}!${minMessages > 0 ? `\nLos participantes necesitarán ${minMessages} mensajes para participar.` : ''}${requiredRole ? `\nRol requerido: ${requiredRole}` : ''}${hostOption ? `\nHost establecido: ${hostOption.tag}` : ''}`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ No se pudo crear el sorteo. Verifica los datos e intenta nuevamente.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: '❌ Ocurrió un error al crear el sorteo.',
                ephemeral: true
            });
        }
    },
};