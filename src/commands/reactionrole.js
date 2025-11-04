const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Crea un mensaje para roles por reacción (varios mappings)')
        .addStringOption(option =>
            option.setName('mappings')
                .setDescription('Formato: emoji:rol,emoji:rol (ej: 🎉:@Rol,🔔:@OtroRol). Usa menciones de rol o IDs de rol.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('descripcion')
                .setDescription('Descripción del mensaje')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde publicar el mensaje (por defecto el canal actual)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const mappingsRaw = interaction.options.getString('mappings');
        const description = interaction.options.getString('descripcion') || '';
        const channel = interaction.options.getChannel('canal') || interaction.channel;

        // Parsear mappings: separar por comas, luego por ':' -> [emoji, role]
        const parts = mappingsRaw.split(',').map(p => p.trim()).filter(Boolean);
        const mappings = [];

        for (const part of parts) {
            const [emojiPart, rolePart] = part.split(':').map(s => s && s.trim());
            if (!emojiPart || !rolePart) continue;

            // intentar extraer ID de rol si es una mención <@&id>
            const roleIdMatch = rolePart.match(/<@&(\d+)>/);
            const roleId = roleIdMatch ? roleIdMatch[1] : (rolePart.match(/^(\d{17,19})$/) ? rolePart : null);

            if (!roleId) {
                // intentamos buscar por nombre en el guild (solo si es texto)
                const found = interaction.guild.roles.cache.find(r => r.name === rolePart);
                if (found) {
                    mappings.push({ emoji: emojiPart, roleId: found.id });
                }
                continue;
            }

            mappings.push({ emoji: emojiPart, roleId });
        }

        if (mappings.length === 0) {
            return interaction.reply({ content: '❌ No se pudo parsear ningún mapping válido. Usa el formato emoji:rol,emoji:rol.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎭 Roles por Reacción')
            .setDescription(`${description}\n\n${mappings.map(m => `${m.emoji} → <@&${m.roleId}>`).join('\n')}`)
            .setColor('#FF5733')
            .setTimestamp();

        const message = await channel.send({ embeds: [embed] });

        // Reaccionar con cada emoji (ignorar errores en emojis custom/no válidos)
        for (const m of mappings) {
            try {
                await message.react(m.emoji);
            } catch (e) {
                console.warn('No se pudo reaccionar con', m.emoji, e.message);
            }
        }

        if (!interaction.client.reactionRoles) interaction.client.reactionRoles = new Map();

        // Guardar array de mappings por message id
        interaction.client.reactionRoles.set(message.id, {
            messageId: message.id,
            channelId: message.channel.id,
            guildId: message.guild.id,
            mappings // array de {emoji, roleId}
        });

        await interaction.reply({ content: '✅ Mensaje de roles por reacción creado exitosamente.', ephemeral: true });
    },
};