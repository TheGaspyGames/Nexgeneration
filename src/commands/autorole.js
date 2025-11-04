const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Configura los roles automáticos')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Añade un rol automático')
                .addRoleOption(option =>
                    option.setName('rol')
                        .setDescription('El rol que se añadirá automáticamente')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remueve un rol automático')
                .addRoleOption(option =>
                    option.setName('rol')
                        .setDescription('El rol que se removerá de los autoroles')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lista todos los roles automáticos'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add': {
                const role = interaction.options.getRole('rol');
                if (!config.autoroles.roles.includes(role.id)) {
                    config.autoroles.roles.push(role.id);
                    await interaction.reply({
                        content: `✅ El rol ${role} ha sido añadido a los autoroles.`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ El rol ${role} ya está en la lista de autoroles.`,
                        ephemeral: true
                    });
                }
                break;
            }
            case 'remove': {
                const role = interaction.options.getRole('rol');
                const index = config.autoroles.roles.indexOf(role.id);
                if (index > -1) {
                    config.autoroles.roles.splice(index, 1);
                    await interaction.reply({
                        content: `✅ El rol ${role} ha sido removido de los autoroles.`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ El rol ${role} no está en la lista de autoroles.`,
                        ephemeral: true
                    });
                }
                break;
            }
            case 'list': {
                const roleList = config.autoroles.roles.map(roleId => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return role ? `- ${role.name}` : '- Rol no encontrado';
                }).join('\n');

                await interaction.reply({
                    content: `📋 **Roles Automáticos:**\n${roleList || 'No hay roles automáticos configurados.'}`,
                    ephemeral: true
                });
                break;
            }
        }
    },
};