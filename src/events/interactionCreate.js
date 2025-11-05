const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Manejar comandos de barra
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            // Verificar si estamos en el servidor permitido
            const settings = require('../../config/settings.json');
            if (settings.guildId && interaction.guildId !== settings.guildId) {
                await interaction.reply({ 
                    content: '⚠️ Este bot solo está configurado para funcionar en un servidor específico.', 
                    ephemeral: true 
                });
                return;
            }

            // Si estamos en el server de logs, no ejecutar comandos (solo mostrar logs)
            const config = require('../../config/config.js');
            const logsGuild = config.logs && config.logs.guildId;
            const args = [];
            if (interaction.options && interaction.options.data) {
                for (const option of interaction.options.data) {
                    // Soporta subcommands con opciones internas
                    if (option.type === 1 && option.options) {
                        for (const subOpt of option.options) {
                            if (subOpt.value) args.push(`${subOpt.name}: "${subOpt.value}"`);
                        }
                    } else if (option.value) {
                        args.push(`${option.name}: "${option.value}"`);
                    }
                }
            }

            const logDescription = `Canal: ${interaction.channelId}\nInterior: ${args.length > 0 ? `${args.join(', ')}` : ''}`;

            // Si estamos en el server de logs, no ejecutar comandos (solo mostrar logs)
            if (interaction.guildId === logsGuild) {
                // Registrar el intento de uso en el canal de logs y responder que está deshabilitado
                await interaction.reply({ content: '⚠️ En este servidor los comandos están deshabilitados. Este servidor solo recibe logs.', ephemeral: true });
                await interaction.client.log('Comando (bloqueado)', `/${interaction.commandName}`, logDescription, { id: interaction.user.id, tag: interaction.user.tag });
                return;
            }

            try {
                // Registrar uso del comando en logs
                await interaction.client.log('Comando', `/${interaction.commandName}`, logDescription, { id: interaction.user.id, tag: interaction.user.tag });
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.client.log('Error', `/${interaction.commandName}`, `Error: ${error.message}`, { id: interaction.user.id, tag: interaction.user.tag });
                const errorMessage = {
                    content: '❌ ¡Hubo un error al ejecutar este comando!',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }

        // Manejar botones de sorteos
        if (interaction.isButton()) {
            if (interaction.customId === 'giveaway-join') {
                await interaction.client.giveawayManager.handleJoin(interaction);
            } else if (interaction.customId === 'giveaway-participants') {
                await interaction.client.giveawayManager.handleParticipants(interaction);
            }
        }
    },
};