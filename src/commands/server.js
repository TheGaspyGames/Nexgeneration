const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const net = require('net');
const config = require('../../config/config.js');

const verificationLabels = {
    0: 'Ninguno',
    1: 'Bajo',
    2: 'Medio',
    3: 'Alto',
    4: 'Muy alto',
};

const boostLabels = {
    0: 'Sin boosts',
    1: 'Nivel 1',
    2: 'Nivel 2',
    3: 'Nivel 3',
};

function formatVerificationLevel(level) {
    return verificationLabels?.[level] || 'Desconocido';
}

function formatBoostLevel(level) {
    return boostLabels?.[level] || 'Sin boosts';
}

function formatCreationDate(timestamp) {
    const seconds = Math.floor((timestamp || 0) / 1000);
    return seconds > 0
        ? `<t:${seconds}:D> (hace <t:${seconds}:R>)`
        : 'Fecha no disponible';
}

function checkMinecraftStatus(host, port, timeoutMs) {
    return new Promise((resolve) => {
        if (!host || !port) {
            resolve(null);
            return;
        }

        const socket = net.connect({ host, port, timeout: timeoutMs || 4000 });

        const handleError = () => {
            socket.destroy();
            resolve(false);
        };

        const handleSuccess = () => {
            socket.end();
            resolve(true);
        };

        socket.once('connect', handleSuccess);
        socket.once('timeout', handleError);
        socket.once('error', handleError);
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Comandos relacionados con el servidor de Discord')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Muestra información general y el estado del servidor de Minecraft'),
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({
                content: '⚠️ Este comando solo puede usarse dentro de un servidor.',
                ephemeral: true,
            });
            return;
        }

        if (interaction.options.getSubcommand() !== 'info') {
            await interaction.reply({
                content: '⚠️ Subcomando no reconocido.',
                ephemeral: true,
            });
            return;
        }

        const guild = interaction.guild;
        const iconUrl = guild.iconURL({ size: 256 }) || null;
        const botCount = guild.members?.cache?.filter(member => member.user.bot).size || 0;
        const totalMembers = guild.memberCount || 0;
        const userCount = Math.max(totalMembers - botCount, 0);
        const boostCount = guild.premiumSubscriptionCount || 0;

        const { minecraftServer = {} } = config;
        const { host, port, bedrockHosts = [], statusTimeoutMs = 4000 } = minecraftServer;

        await interaction.deferReply();

        const mcStatus = await checkMinecraftStatus(host, port, statusTimeoutMs);
        const mcStatusText = mcStatus === null
            ? 'No se ha configurado un servidor de Minecraft para monitorear.'
            : mcStatus
                ? '🟢 Servidor encendido'
                : '🔴 Servidor apagado';

        const javaAddress = host && port ? `${host}:${port}` : 'No configurado';
        const bedrockAddressList = bedrockHosts.length > 0
            ? bedrockHosts.map(domain => `${domain}:${port}`).join('\n')
            : 'No configurado';

        const embed = new EmbedBuilder()
            .setTitle('Información del servidor')
            .setColor(config.embedColor || '#5865F2')
            .setDescription(guild.description || 'Sin descripción establecida.')
            .setThumbnail(iconUrl)
            .addFields(
                {
                    name: 'Nombre',
                    value: guild.name || 'No disponible',
                    inline: true,
                },
                {
                    name: 'Miembros',
                    value: `Total: **${totalMembers}**\nUsuarios: **${userCount}**\nBots: **${botCount}**`,
                    inline: true,
                },
                {
                    name: 'Creación',
                    value: formatCreationDate(guild.createdTimestamp),
                    inline: true,
                },
                {
                    name: 'Verificación',
                    value: formatVerificationLevel(guild.verificationLevel),
                    inline: true,
                },
                {
                    name: 'Boosts',
                    value: `${formatBoostLevel(guild.premiumTier)}\nImpulsos: **${boostCount}**`,
                    inline: true,
                },
                {
                    name: 'Direcciones de Minecraft',
                    value: `Java: **${javaAddress}**\nBedrock: **${bedrockAddressList}**`,
                    inline: false,
                },
                {
                    name: 'Estado del servidor de Minecraft',
                    value: mcStatusText,
                    inline: false,
                },
            );

        await interaction.editReply({ embeds: [embed] });
    },
};
