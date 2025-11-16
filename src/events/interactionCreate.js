const { Events, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.client.debugMode) {
            const allowedDuringDebug = interaction.client.debugAllowedCommands || new Set();
            const isAllowedCommand = interaction.isChatInputCommand() && allowedDuringDebug.has(interaction.commandName);

            if (!isAllowedCommand) {
                if (interaction.isRepliable()) {
                    const message = '⚠️ El bot se encuentra en modo debug automático. Los comandos y botones están temporalmente deshabilitados. Solo `/update` está disponible para administradores.';
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: message, ephemeral: true }).catch(() => null);
                    } else {
                        await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
                    }
                }
                return;
            }
        }

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
            if (interaction.customId?.startsWith('automod-review:')) {
                const parts = interaction.customId.split(':');
                if (parts.length < 3) {
                    await replyToInteraction(interaction, '⚠️ No se pudo procesar esta acción.');
                    return;
                }

                const action = parts[1];
                const reviewId = parts[2];
                const store = interaction.client.autoModReviewActions?.get(reviewId);

                if (!store) {
                    await replyToInteraction(interaction, '⚠️ Esta revisión ya no está disponible.');
                    return;
                }

                if (action === 'good') {
                    await replyToInteraction(interaction, '✅ Marcado como buen insulto. No se realizaron cambios.');
                    return;
                }

                if (action === 'bad') {
                    const wordsToRemove = Array.isArray(store.words) ? store.words : [];
                    const removed = removeBannedWords(wordsToRemove);
                    interaction.client.autoModReviewActions.delete(reviewId);

                    if (removed > 0) {
                        await replyToInteraction(interaction, `✅ Se eliminaron ${removed} palabra(s) de la lista prohibida.`);
                        await disableInteractionButtons(interaction).catch(() => null);
                    } else {
                        await replyToInteraction(interaction, '⚠️ No se encontraron esas palabras en la lista prohibida.');
                    }
                    return;
                }

                await replyToInteraction(interaction, '⚠️ Acción no reconocida.');
                return;
            }

            if (interaction.customId === 'giveaway-join') {
                await interaction.client.giveawayManager.handleJoin(interaction);
            } else if (interaction.customId === 'giveaway-participants') {
                await interaction.client.giveawayManager.handleParticipants(interaction);
            } else if (interaction.customId?.startsWith('giveaway-leave:')) {
                await interaction.client.giveawayManager.handleLeave(interaction);
            }
        }
    },
};

async function replyToInteraction(interaction, content) {
    const payload = { content, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
        return interaction.followUp(payload);
    }
    return interaction.reply(payload);
}

function removeBannedWords(words) {
    if (!Array.isArray(words) || !words.length) {
        return 0;
    }

    const normalized = new Set(words.filter(Boolean).map(word => word.toLowerCase()));
    if (!normalized.size) return 0;

    let removed = 0;
    for (let i = config.autoModeration.bannedWords.length - 1; i >= 0; i--) {
        const current = config.autoModeration.bannedWords[i];
        if (normalized.has(current.toLowerCase())) {
            config.autoModeration.bannedWords.splice(i, 1);
            removed++;
        }
    }
    return removed;
}

async function disableInteractionButtons(interaction) {
    if (!interaction?.message?.components?.length) return;
    const disabledRows = interaction.message.components.map(row => {
        const builder = ActionRowBuilder.from(row);
        builder.components = row.components.map(component => ButtonBuilder.from(component).setDisabled(true));
        return builder;
    });
    await interaction.message.edit({ components: disabledRows });
}
