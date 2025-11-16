const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const ms = require('ms');

class GiveawayManager {
    constructor(client) {
        this.client = client;
        this.giveaways = new Map();
        this.messageCount = new Map(); // Para rastrear los mensajes de los usuarios
        this.expirationWatcher = null;
        this.startExpirationWatcher();
    }

    startExpirationWatcher() {
        if (this.expirationWatcher) return;

        this.expirationWatcher = setInterval(() => {
            this.sweepExpiredGiveaways();
        }, 5 * 1000); // Revisa cada 5 segundos para finalizar sorteos apenas expiren
    }

    stopExpirationWatcherIfIdle() {
        if (!this.expirationWatcher) return;

        const hasActiveGiveaways = Array.from(this.giveaways.values()).some(giveaway => !giveaway.ended);
        if (!hasActiveGiveaways) {
            clearInterval(this.expirationWatcher);
            this.expirationWatcher = null;
        }
    }

    sweepExpiredGiveaways() {
        if (!this.giveaways.size) {
            this.stopExpirationWatcherIfIdle();
            return;
        }

        const now = Date.now();
        for (const [messageId, giveaway] of this.giveaways.entries()) {
            if (giveaway.ended) continue;
            if (giveaway.endTime <= now) {
                this.endGiveaway(messageId).catch(error => {
                    console.error('Error al finalizar un sorteo expirado:', error);
                });
            }
        }
    }

    async createGiveaway(options) {
        const {
            channelId,
            duration,
            winners,
            prize,
            host,
                message,
                minMessages = 0,
                requiredRole = null,
                requiredInvites = 0
        } = options;

        const channel = await this.client.channels.fetch(channelId);
        if (!channel) return null;

        const durationMs = ms(duration);
        if (!durationMs || Number.isNaN(durationMs)) {
            throw new Error('Duración del sorteo inválida. Usa valores como 30s, 5m, 1h, etc.');
        }

        const endTime = Date.now() + durationMs;

        const embed = new EmbedBuilder()
            .setTitle('🎉 SORTEO')
                .setDescription(`**Premio:** ${prize}\n**Ganadores:** ${winners}\n**Host:** ${host.tag}\n**Termina:** <t:${Math.floor(endTime / 1000)}:R>\n\nReacciona con 🎉 para participar!`)
            .setColor('#FF5733')
            .setFooter({ text: `Termina el ${new Date(endTime).toLocaleString()}` })
            .addFields({ name: 'Requisitos', value: `${minMessages > 0 ? `Mensajes mínimos: ${minMessages}\n` : ''}${requiredRole ? `Rol requerido: <@&${requiredRole}>` : 'Ninguno'}` });
        if (requiredInvites && requiredInvites > 0) {
            embed.addFields({ name: 'Invites requeridos', value: `${requiredInvites} invite(s)`, inline: false });
        }
        embed.addFields({ name: 'Participantes', value: '0', inline: false });

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway-join')
                    .setLabel('Participar')
                    .setEmoji('🎉')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('giveaway-participants')
                    .setLabel('Participantes')
                    .setStyle(ButtonStyle.Secondary)
            );

        const giveawayMessage = await channel.send({
            embeds: [embed],
            components: [buttons]
        });

        const giveaway = {
            messageId: giveawayMessage.id,
            channelId: channel.id,
            guildId: channel.guildId,
            prize,
            winners: Number(winners),
            host: host.id,
            endTime,
                                minMessages,
                            requiredRole,
                        requiredInvites,
            participants: new Set(),
            ended: false
        };

        this.giveaways.set(giveawayMessage.id, giveaway);
        this.setTimer(giveawayMessage.id);
        this.startExpirationWatcher();

        return giveaway;
    }

    async endGiveaway(messageId) {
        const giveaway = this.giveaways.get(messageId);
        if (!giveaway || giveaway.ended) return;

        const channel = await this.client.channels.fetch(giveaway.channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(messageId);
        if (!message) return;

        const participants = Array.from(giveaway.participants);
        const winners = [];

        for (let i = 0; i < giveaway.winners && participants.length > 0; i++) {
            const winnerIndex = Math.floor(Math.random() * participants.length);
            winners.push(participants[winnerIndex]);
            participants.splice(winnerIndex, 1);
        }

        const winnerMentions = winners.map(id => `<@${id}>`).join(', ') || 'Nadie participó';

        const embed = new EmbedBuilder()
            .setTitle('🎉 SORTEO TERMINADO')
            .setDescription(`**Premio:** ${giveaway.prize}\n**Ganadores:** ${winnerMentions}\n**Host:** <@${giveaway.host}>`)
            .setColor('#FF5733')
            .setFooter({ text: 'Sorteo finalizado' })
            .addFields({ name: 'Requisitos', value: `${giveaway.minMessages && giveaway.minMessages > 0 ? `Mensajes mínimos: ${giveaway.minMessages}\n` : ''}${giveaway.requiredRole ? `Rol requerido: <@&${giveaway.requiredRole}>` : 'Ninguno'}` });
            if (giveaway.requiredInvites && giveaway.requiredInvites > 0) {
                embed.addFields({ name: 'Invites requeridos', value: `${giveaway.requiredInvites} invite(s)`, inline: false });
            }

        await message.edit({
            embeds: [embed],
            components: []
        });

        if (winners.length > 0) {
            await channel.send({
                content: `¡Felicitaciones ${winnerMentions}! Han ganado: **${giveaway.prize}**`,
                allowedMentions: { users: winners }
            });
        }

        giveaway.ended = true;
        this.giveaways.set(messageId, giveaway);
        this.stopExpirationWatcherIfIdle();
    }

    setTimer(messageId) {
        const giveaway = this.giveaways.get(messageId);
        if (!giveaway) return;

        const delay = Math.max(0, giveaway.endTime - Date.now());
        if (delay === 0) {
            this.endGiveaway(messageId).catch(error => {
                console.error('Error al finalizar un sorteo al instante:', error);
            });
            return;
        }

        setTimeout(() => {
            this.endGiveaway(messageId).catch(error => {
                console.error('Error al finalizar un sorteo programado:', error);
            });
        }, delay);
    }

    async handleJoin(interaction) {
        const giveaway = this.giveaways.get(interaction.message.id);
        if (!giveaway || giveaway.ended) {
            return interaction.reply({
                content: '❌ Este sorteo ya ha terminado.',
                ephemeral: true
            });
        }

            // Verificar mensajes mínimos si están configurados
            if (giveaway.minMessages > 0) {
                const userMessages = this.messageCount.get(interaction.user.id) || 0;
                if (userMessages < giveaway.minMessages) {
                    return interaction.reply({
                        content: `❌ Necesitas tener al menos ${giveaway.minMessages} mensajes en el servidor para participar. Actualmente tienes ${userMessages} mensajes.`,
                        ephemeral: true
                    });
                }
            }

            // Verificar rol requerido si aplica
            if (giveaway.requiredRole) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    if (!member.roles.cache.has(giveaway.requiredRole)) {
                        return interaction.reply({
                            content: `❌ Necesitas el rol <@&${giveaway.requiredRole}> para participar en este sorteo.`,
                            ephemeral: true
                        });
                    }
                } catch (e) {
                    console.error('Error verificando rol requerido:', e.message);
                    return interaction.reply({ content: '❌ Error al verificar tus roles. Intenta de nuevo.', ephemeral: true });
                }
            }

            // Verificar invites requeridos si aplica
            if (giveaway.requiredInvites && giveaway.requiredInvites > 0) {
                try {
                    const invites = await interaction.guild.invites.fetch();
                    const userInvites = invites.filter(i => i.inviter && i.inviter.id === interaction.user.id);
                    let uses = 0;
                    for (const inv of userInvites.values()) {
                        uses += inv.uses || 0;
                    }
                    if (uses < giveaway.requiredInvites) {
                        return interaction.reply({
                            content: `❌ Necesitas al menos ${giveaway.requiredInvites} invite(s) (usos) para participar. Actualmente tienes ${uses}.`,
                            ephemeral: true
                        });
                    }
                } catch (e) {
                    console.error('Error verificando invites:', e.message);
                    return interaction.reply({ content: '❌ No se pudo verificar tus invites. Asegúrate de que el bot tenga permiso para ver las invites.', ephemeral: true });
                }
            }

        if (giveaway.participants.has(interaction.user.id)) {
            const leaveRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway-leave:${interaction.message.id}`)
                    .setLabel('Salir del sorteo')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({
                content: '¿Estás seguro de salir del sorteo?',
                components: [leaveRow],
                ephemeral: true
            });
        } else {
            giveaway.participants.add(interaction.user.id);
            await interaction.reply({
                content: '✅ ¡Has entrado al sorteo!',
                ephemeral: true
            });
        }

        this.giveaways.set(interaction.message.id, giveaway);
        await this.updateParticipantsField(interaction.message, giveaway);
    }

    async handleLeave(interaction) {
        try {
            const [, messageId] = interaction.customId.split(':');
            if (!messageId) {
                return interaction.reply({
                    content: '❌ No se pudo procesar tu solicitud.',
                    ephemeral: true
                });
            }

            const giveaway = this.giveaways.get(messageId);
            if (!giveaway || giveaway.ended) {
                return interaction.update({
                    content: '❌ Este sorteo ya no está disponible.',
                    components: []
                });
            }

            if (!giveaway.participants.has(interaction.user.id)) {
                return interaction.update({
                    content: '⚠️ Ya no estás participando en este sorteo.',
                    components: []
                });
            }

            giveaway.participants.delete(interaction.user.id);
            this.giveaways.set(messageId, giveaway);
            await this.updateParticipantsField(null, giveaway);

            await interaction.update({
                content: '❌ Has abandonado el sorteo.',
                components: []
            });
        } catch (error) {
            console.error('Error al manejar la salida del sorteo:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ Hubo un problema al procesar tu solicitud.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Hubo un problema al procesar tu solicitud.', ephemeral: true });
            }
        }
    }

    async handleParticipants(interaction) {
        const giveaway = this.giveaways.get(interaction.message.id);
        if (!giveaway) {
            return interaction.reply({
                content: '❌ No se encontró información sobre este sorteo.',
                ephemeral: true
            });
        }

        const participants = Array.from(giveaway.participants);
        const participantCount = participants.length;
        const participantList = participantCount > 0
            ? participants.map((id, index) => `${index + 1}.- <@${id}>`).join('\n')
            : 'No hay participantes registrados todavía.';

        const embed = new EmbedBuilder()
            .setTitle('📋 Participantes del sorteo')
            .setDescription(participantList)
            .addFields({ name: 'Total', value: `${participantCount}`, inline: false })
            .setColor('#5865F2');

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async updateParticipantsField(message, giveaway) {
        try {
            let targetMessage = message;
            if (!targetMessage) {
                const channel = await this.client.channels.fetch(giveaway.channelId);
                if (!channel) return;
                targetMessage = await channel.messages.fetch(giveaway.messageId);
            }

            if (!targetMessage || !targetMessage.embeds.length) return;

            const updatedEmbed = EmbedBuilder.from(targetMessage.embeds[0]);
            const fields = updatedEmbed.data.fields ? [...updatedEmbed.data.fields] : [];
            const participantIndex = fields.findIndex(field => field.name === 'Participantes');
            const participantValue = `${giveaway.participants.size}`;

            if (participantIndex !== -1) {
                fields[participantIndex] = { ...fields[participantIndex], value: participantValue };
            } else {
                fields.push({ name: 'Participantes', value: participantValue, inline: false });
            }

            updatedEmbed.setFields(fields);

            await targetMessage.edit({
                embeds: [updatedEmbed],
                components: targetMessage.components
            });
        } catch (error) {
            console.error('Error actualizando el contador de participantes del sorteo:', error);
        }
    }
}

module.exports = GiveawayManager;