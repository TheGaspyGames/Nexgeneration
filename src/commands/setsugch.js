const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setsugch')
        .setDescription('Establece el canal donde se enviarán las sugerencias')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal de sugerencias')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        const settingsPath = path.join(__dirname, '..', '..', 'config', 'settings.json');
        let settings = {};
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { /* ignore */ }
        settings.suggestionsChannel = channel.id;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        await interaction.reply({ content: `✅ Canal de sugerencias establecido a ${channel}`, ephemeral: true });
    }
};
