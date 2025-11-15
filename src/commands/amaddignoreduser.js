const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('amaddignoreduser')
        .setDescription('Añade un usuario a la lista de ignorados por el automod')
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Usuario que será ignorado por el automod')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const user = interaction.options.getUser('usuario', true);

        if (config.autoModeration.ignoredUsers.includes(user.id)) {
            await interaction.reply({
                content: '⚠️ Ese usuario ya está ignorado por el automod.',
                ephemeral: true,
            });
            return;
        }

        config.autoModeration.ignoredUsers.push(user.id);

        await interaction.reply({
            content: `✅ ${user} ha sido añadido a la lista de ignorados del automod.`,
            ephemeral: true,
        });
    },
};
