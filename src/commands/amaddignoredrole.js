const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('amaddignoredrole')
        .setDescription('Añade un rol a la lista de roles ignorados por el automod')
        .addRoleOption(option =>
            option
                .setName('rol')
                .setDescription('Rol que será ignorado por el automod')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const role = interaction.options.getRole('rol');

        if (!interaction.guild || role.guild.id !== interaction.guild.id) {
            await interaction.reply({
                content: '❌ Debes seleccionar un rol de este servidor.',
                ephemeral: true,
            });
            return;
        }

        if (config.autoModeration.ignoredRoles.includes(role.id)) {
            await interaction.reply({
                content: '⚠️ Ese rol ya está ignorado por el automod.',
                ephemeral: true,
            });
            return;
        }

        config.autoModeration.ignoredRoles.push(role.id);

        await interaction.reply({
            content: `✅ El rol ${role} ha sido añadido a la lista de ignorados del automod.`,
            ephemeral: true,
        });
    },
};
