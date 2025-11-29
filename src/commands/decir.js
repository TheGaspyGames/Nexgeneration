const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('decir')
        .setDescription('Haz que el bot repita exactamente el texto que proporciones.')
        .addStringOption(option =>
            option
                .setName('texto')
                .setDescription('El mensaje que dirá el bot')
                .setRequired(true)
        ),

    async execute(interaction) {
        const message = interaction.options.getString('texto', true);
        await interaction.reply({ content: '✅ Mensaje enviado.', ephemeral: true });
        await interaction.followUp({ content: message });
    },
};
