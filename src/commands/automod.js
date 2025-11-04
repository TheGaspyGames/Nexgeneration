const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configura el sistema de automoderación')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Activa o desactiva la automoderación'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('maxmentions')
                .setDescription('Configura el máximo de menciones permitidas')
                .addIntegerOption(option =>
                    option.setName('cantidad')
                        .setDescription('Número máximo de menciones permitidas')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(25)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addword')
                .setDescription('Añade una palabra a la lista de palabras prohibidas')
                .addStringOption(option =>
                    option.setName('palabra')
                        .setDescription('La palabra que será prohibida')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('aiflag')
                .setDescription('Activa o desactiva el marcado por IA (solo marca, no sanciona)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removeword')
                .setDescription('Remueve una palabra de la lista de palabras prohibidas')
                .addStringOption(option =>
                    option.setName('palabra')
                        .setDescription('La palabra que será removida')
                        .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'toggle': {
                config.autoModeration.enabled = !config.autoModeration.enabled;
                await interaction.reply({
                    content: `✅ La automoderación ha sido ${config.autoModeration.enabled ? 'activada' : 'desactivada'}.`,
                    ephemeral: true
                });
                break;
            }
            case 'maxmentions': {
                const amount = interaction.options.getInteger('cantidad');
                config.autoModeration.maxMentions = amount;
                await interaction.reply({
                    content: `✅ El máximo de menciones ha sido establecido a ${amount}.`,
                    ephemeral: true
                });
                break;
            }
            case 'addword': {
                const word = interaction.options.getString('palabra').toLowerCase();
                if (!config.autoModeration.bannedWords.includes(word)) {
                    config.autoModeration.bannedWords.push(word);
                    await interaction.reply({
                        content: '✅ Palabra añadida a la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Esta palabra ya está en la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                }
                break;
            }
            case 'aiflag': {
                const fs = require('fs');
                const path = require('path');

                config.autoModeration.aiFlagging = !config.autoModeration.aiFlagging;

                // Si se activa y no hay canal de mod logs configurado, usar el canal donde se ejecuta el comando
                const settingsPath = path.join(__dirname, '..', '..', 'config', 'settings.json');
                let settings = {};
                try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { settings = {}; }

                if (config.autoModeration.aiFlagging) {
                    if (!settings.modLogChannel) {
                        settings.modLogChannel = interaction.channel.id;
                        try {
                            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                            // Update runtime client.settings if available
                            if (interaction.client && interaction.client.settings) interaction.client.settings.modLogChannel = settings.modLogChannel;
                        } catch (e) {
                            console.error('No se pudo guardar settings.json:', e.message);
                        }
                        await interaction.reply({ content: `✅ AI flagging activado. Canal de mod logs establecido a este canal (${interaction.channel}).`, ephemeral: true });
                        break;
                    }
                }

                await interaction.reply({
                    content: `✅ AI flagging ha sido ${config.autoModeration.aiFlagging ? 'activado' : 'desactivado'}.`,
                    ephemeral: true
                });
                break;
            }
            case 'removeword': {
                const word = interaction.options.getString('palabra').toLowerCase();
                const index = config.autoModeration.bannedWords.indexOf(word);
                if (index > -1) {
                    config.autoModeration.bannedWords.splice(index, 1);
                    await interaction.reply({
                        content: '✅ Palabra removida de la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Esta palabra no está en la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                }
                break;
            }
        }
    },
};