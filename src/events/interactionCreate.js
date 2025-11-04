const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Manejar comandos de barra
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            // Si estamos en el server de logs, no ejecutar comandos (solo mostrar logs)
            const config = require('../../config/config.js');
            const logsGuild = config.logs && config.logs.guildId;
            const logsChannel = config.logs && config.logs.channelId;
            if (interaction.guildId === logsGuild) {
                // Registrar el intento de uso en el canal de logs y responder que está deshabilitado
                await interaction.reply({ content: '⚠️ En este servidor los comandos están deshabilitados. Este servidor solo recibe logs.', ephemeral: true });
                await interaction.client.log('Comando (bloqueado)', interaction.commandName, `Usuario: ${interaction.user.tag} (${interaction.user.id})\nGuild: ${interaction.guildId}\nCanal: ${interaction.channelId}`);
                return;
            }

            try {
                // Registrar uso del comando en logs
                await interaction.client.log('Comando', interaction.commandName, `Usuario: ${interaction.user.tag} (${interaction.user.id})\nGuild: ${interaction.guildId}\nCanal: ${interaction.channelId}`);
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.client.log('Error', interaction.commandName, `Error: ${error.message}\nUsuario: ${interaction.user.tag} (${interaction.user.id})`);
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