const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');
const { Suggestion, getNextSequence, isMongoConnected } = require('../models/Suggestion');

const staffGuildId = config.staffSuggestionsGuildId;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staffsugerir')
        .setDescription('Envía una sugerencia privada para el staff')
        .addStringOption(option =>
            option.setName('sugerencia')
                .setDescription('Tu sugerencia para el staff')
                .setRequired(true))
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

        const suggestion = interaction.options.getString('sugerencia');
        const channelId = config.staffSuggestionsChannel;
        const channel = await interaction.client.resolveChannel(channelId);

        if (!channel || (staffGuildId && channel.guildId !== staffGuildId)) {
            return interaction.reply({
                content: '❌ El canal privado de sugerencias para el staff no está disponible.',
                ephemeral: true
            });
        }

        let id;
        try {
            if (isMongoConnected()) {
                id = await getNextSequence('suggestionId');
            }
        } catch (err) {
            console.error('Error obteniendo next sequence para sugerencias staff:', err.message);
        }
        if (!id) {
            id = Date.now();
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Nueva sugerencia para el staff')
            .addFields(
                { name: 'ID sug:', value: `${id}`, inline: true },
                { name: 'Fecha:', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: 'Autor:', value: interaction.user.tag, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: 'Sug:', value: suggestion },
                { name: '\u200B', value: '\u200B' },
                { name: 'Estado', value: '⏳ Pendiente', inline: true },
                { name: 'Votos', value: '👍 0 | 👎 1', inline: true }
            )
            .setColor('#9b59b6')
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setTimestamp();

        const message = await channel.send({ embeds: [embed] });
        await message.react('👍');
        await message.react('👎');

        let savedInDb = false;
        try {
            if (Suggestion && isMongoConnected()) {
                const doc = new Suggestion({
                    id: id,
                    scope: 'staff',
                    authorId: interaction.user.id,
                    authorTag: interaction.user.tag,
                    authorAvatar: interaction.user.displayAvatarURL({ dynamic: true, size: 1024 }),
                    messageId: message.id,
                    channelId: channel.id,
                    content: suggestion,
                    status: 'Pendiente',
                    approvals: 0
                });
                await doc.save();
                savedInDb = true;
            }
        } catch (e) {
            console.error('No se pudo guardar la sugerencia del staff en MongoDB:', e);
        }

        let replyMessage = `✅ Tu sugerencia para el staff ha sido enviada al canal <#${channelId}>`;
        if (!savedInDb) {
            replyMessage += '\n⚠️ No se pudo guardar en la base de datos, pero la sugerencia seguirá visible en el canal.';
        }

        await interaction.reply({
            content: replyMessage,
            ephemeral: true
        });
    },
};
