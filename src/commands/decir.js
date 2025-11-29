const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('decir')
        .setDescription('Haz que el bot repita exactamente el texto que proporciones.')
        .addStringOption(option =>
            option
                .setName('texto')
                .setDescription('El mensaje que dirá el bot')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const message = interaction.options.getString('texto', true);
        await interaction.deferReply({ ephemeral: true });
        await interaction.channel.send({ content: message });
        await interaction.deleteReply();
    },
};
