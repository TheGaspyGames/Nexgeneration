const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const ms = require('ms');

const PARTICIPANTS_FIELD = 'Participantes';
const WATCHDOG_INTERVAL_MS = 5 * 1000;
const INVITE_USAGE_TTL_MS = 60 * 1000;

class GiveawayManager {
    constructor(client) {
        this.client = client;
        this.giveaways = new Map();
        this.messageCount = new Map(); // Para rastrear los mensajes de los usuarios
        this.expirationWatcher = null;
        this.startExpirationWatcher();
    }

    getGiveawayById(giveawayId) {
        if (!giveawayId) return null;
        return this.giveaways.get(giveawayId) || null;
    }

    getMostRecentGiveaway(options = {}) {
        const giveaways = Array.from(this.giveaways.values());
        if (!giveaways.length) return null;

        const { endedOnly = false, activeOnly = false } = options;
        const filtered = giveaways.filter(giveaway => {
            if (endedOnly) return giveaway.ended;
            if (activeOnly) return !giveaway.ended;
            return true;
        });

        if (!filtered.length) return null;

        return filtered.sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0];
    }

    buildRequirementsList(giveaway) {
        const requirements = [];
        if (giveaway.minMessages && giveaway.minMessages > 0) requirements.push(`Mensajes minimos: ${giveaway.minMessages}`);
        if (giveaway.requiredRole) requirements.push(`Rol requerido: <@&${giveaway.requiredRole}>`);
        if (giveaway.excludedRole) requirements.push(`Rol bloqueado: <@&${giveaway.excludedRole}>`);
        if (!requirements.length) requirements.push('Ninguno');
        return requirements;
    }

    formatWinnerMentions(winners) {
        return (winners && winners.length)
            ? winners.map(id => `<@${id}>`).join(', ')
            : 'Nadie participo';
    }

    buildEndedEmbed(giveaway, winners, options = {}) {
        const winnerMentions = this.formatWinnerMentions(winners);
        const endRequirements = this.buildRequirementsList(giveaway);
        const rerollRequestedBy = options.reroll && options.requestedBy
            ? `\nReroll solicitado por: <@${options.requestedBy}>`
            : '';

        const embed = new EmbedBuilder()
            .setTitle(options.reroll ? 'ÐYZ% SORTEO RERROLLEADO' : 'ÐYZ% SORTEO TERMINADO')
            .setDescription(`**Premio:** ${giveaway.prize}\n**Ganadores:** ${winnerMentions}\n**Host:** <@${giveaway.host}>${rerollRequestedBy}`)
            .setColor('#FF5733')
            .setFooter({ text: options.footerText || (options.reroll ? 'Sorteo rerrolleado' : 'Sorteo finalizado') })
            .addFields({ name: 'Requisitos', value: endRequirements.join('\n') });

        if (giveaway.requiredInvites && giveaway.requiredInvites > 0) {
            embed.addFields({ name: 'Invites requeridos', value: `${giveaway.requiredInvites} invite(s)`, inline: false });
        }

        return embed;
    }

    pickUniqueWinners(participants, amount) {
        const pool = Array.from(participants);
        const winners = [];

        for (let i = 0; i < amount && pool.length > 0; i++) {
            const winnerIndex = Math.floor(Math.random() * pool.length);
            winners.push(pool[winnerIndex]);
            pool.splice(winnerIndex, 1);
        }

        return winners;
    }

    buildError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    startExpirationWatcher() {
        if (this.expirationWatcher) return;

        this.expirationWatcher = setInterval(() => {
            this.sweepExpiredGiveaways();
        }, WATCHDOG_INTERVAL_MS); // Revisa cada 5 segundos para finalizar sorteos apenas expiren
        if (typeof this.expirationWatcher.unref === 'function') {
            this.expirationWatcher.unref();
        }
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
        const pendingClosures = [];
        for (const [messageId, giveaway] of this.giveaways.entries()) {
            if (giveaway.ended || giveaway.endTime > now) continue;
            pendingClosures.push(
                this.endGiveaway(messageId).catch(error => {
                    console.error('Error al finalizar un sorteo expirado:', error);
                })
            );
        }

        if (pendingClosures.length) {
            Promise.allSettled(pendingClosures).catch(error => {
                console.error('Error al barrer sorteos expirados:', error);
            });
        }
    }

    async createGiveaway(options) {
        const {
            channelId,
            duration,
            winners,
            prize,
            host,
            minMessages = 0,
            requiredRole = null,
            excludedRole = null,
            requiredInvites = 0
        } = options;

        const channel = await this.client.resolveChannel(channelId);
        if (!channel) return null;

        const durationMs = ms(duration);
        if (!durationMs || Number.isNaN(durationMs)) {
            throw new Error('Duración del sorteo inválida. Usa valores como 30s, 5m, 1h, etc.');
        }

        const endTime = Date.now() + durationMs;

        const requirements = [];
        if (minMessages > 0) requirements.push(`Mensajes mínimos: ${minMessages}`);
        if (requiredRole) requirements.push(`Rol requerido: <@&${requiredRole}>`);
        if (excludedRole) requirements.push(`Rol bloqueado: <@&${excludedRole}>`);
        if (!requirements.length) requirements.push('Ninguno');

        const embed = new EmbedBuilder()
            .setTitle('🎉 SORTEO')
            .setDescription(`**Premio:** ${prize}\n**Ganadores:** ${winners}\n**Host:** ${host.tag}\n**Termina:** <t:${Math.floor(endTime / 1000)}:R>\n\nReacciona con 🎉 para participar!`)
            .setColor('#FF5733')
            .setFooter({ text: `Termina el ${new Date(endTime).toLocaleString()}` })
            .addFields({ name: 'Requisitos', value: requirements.join('\n') });
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
            excludedRole,
            requiredInvites,
            lastWinners: [],
            participants: new Set(),
            ended: false,
            messageCache: giveawayMessage
        };

        this.giveaways.set(giveawayMessage.id, giveaway);
        this.setTimer(giveawayMessage.id);
        this.startExpirationWatcher();

        return giveaway;
    }

    async endGiveaway(messageId) {
        const giveaway = this.giveaways.get(messageId);
        if (!giveaway || giveaway.ended) return;
        const message = await this.getOrFetchGiveawayMessage(giveaway);
        const channel = message?.channel ?? await this.client.resolveChannel(giveaway.channelId);
        if (!channel) return;

        const winners = this.pickUniqueWinners(giveaway.participants, giveaway.winners);
        giveaway.lastWinners = winners;

        const embed = this.buildEndedEmbed(giveaway, winners, { footerText: 'Sorteo finalizado' });

        if (message) {
            await message.edit({
                embeds: [embed],
                components: []
            });
            giveaway.messageCache = message;
        }

        if (winners.length > 0) {
            await channel.send({
                content: `Felicitaciones ${this.formatWinnerMentions(winners)}! Han ganado: **${giveaway.prize}**`,
                allowedMentions: { users: winners }
            });
        }

        giveaway.ended = true;
        if (giveaway.timeoutId) {
            clearTimeout(giveaway.timeoutId);
            giveaway.timeoutId = null;
        }
        this.giveaways.set(messageId, giveaway);
        this.stopExpirationWatcherIfIdle();
    }

    setTimer(messageId) {
        const giveaway = this.giveaways.get(messageId);
        if (!giveaway) return;

        if (giveaway.timeoutId) {
            clearTimeout(giveaway.timeoutId);
            giveaway.timeoutId = null;
        }

        const delay = Math.max(0, giveaway.endTime - Date.now());
        if (delay === 0) {
            this.endGiveaway(messageId).catch(error => {
                console.error('Error al finalizar un sorteo al instante:', error);
            });
            return;
        }

        giveaway.timeoutId = setTimeout(() => {
            this.endGiveaway(messageId).catch(error => {
                console.error('Error al finalizar un sorteo programado:', error);
            });
        }, delay);
        if (typeof giveaway.timeoutId.unref === 'function') {
            giveaway.timeoutId.unref();
        }
        this.giveaways.set(messageId, giveaway);
    }


    async rerollGiveaway(options = {}) {
        const giveawayId = options.giveawayId || null;
        const requestedBy = options.requestedBy || null;
        const winnersCount = options.winnersCount;
        let giveaway = giveawayId
            ? this.getGiveawayById(giveawayId)
            : this.getMostRecentGiveaway({ endedOnly: true });

        if (!giveaway && !giveawayId) {
            giveaway = this.getMostRecentGiveaway({ activeOnly: true });
        }

        if (!giveaway) {
            throw this.buildError('GIVEAWAY_NOT_FOUND', 'Sorteo no encontrado.');
        }

        if (!giveaway.ended) {
            throw this.buildError('GIVEAWAY_NOT_ENDED', 'El sorteo aun no ha finalizado.');
        }

        const participants = Array.from(giveaway.participants || []);
        if (!participants.length) {
            throw this.buildError('NO_PARTICIPANTS', 'No hay participantes registrados en este sorteo.');
        }

        const totalToPick = Number.isInteger(winnersCount) && winnersCount > 0
            ? winnersCount
            : giveaway.winners;

        if (!totalToPick || Number.isNaN(totalToPick) || totalToPick <= 0) {
            throw this.buildError('INVALID_WINNER_COUNT', 'Cantidad de ganadores invalida.');
        }

        if (participants.length < totalToPick) {
            throw this.buildError('INSUFFICIENT_PARTICIPANTS', 'No hay suficientes participantes para rerrollear.');
        }

        const winners = this.pickUniqueWinners(participants, totalToPick);
        giveaway.lastWinners = winners;
        this.giveaways.set(giveaway.messageId, giveaway);

        const message = await this.getOrFetchGiveawayMessage(giveaway);
        const channel = message?.channel ?? await this.client.resolveChannel(giveaway.channelId);
        if (!channel) {
            throw this.buildError('CHANNEL_UNAVAILABLE', 'No se pudo acceder al canal del sorteo.');
        }

        const embed = this.buildEndedEmbed(giveaway, winners, {
            reroll: true,
            requestedBy,
            footerText: 'Sorteo rerrolleado'
        });

        if (message) {
            await message.edit({ embeds: [embed], components: [] }).catch(() => null);
            giveaway.messageCache = message;
        }

        const messageLink = `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
        const announceEmbed = new EmbedBuilder()
            .setTitle('Reroll completado')
            .setColor('#2ecc71')
            .setDescription(`Premio: **${giveaway.prize}**`)
            .addFields(
                { name: 'Nuevos ganadores', value: this.formatWinnerMentions(winners), inline: false },
                { name: 'Sorteo', value: `[Ver mensaje](${messageLink})`, inline: true },
                { name: 'Solicitado por', value: requestedBy ? `<@${requestedBy}>` : 'Desconocido', inline: true }
            )
            .setTimestamp();

        await channel.send({
            embeds: [announceEmbed],
            allowedMentions: { users: winners }
        });

        return { giveaway, winners, channel, message };
    }

    async expelParticipantFromGiveaway(options = {}) {
        const giveawayId = options.giveawayId || null;
        const userId = options.userId;
        if (!userId) {
            throw this.buildError('USER_REQUIRED', 'Debes indicar un usuario.');
        }

        const giveaway = giveawayId
            ? this.getGiveawayById(giveawayId)
            : this.getMostRecentGiveaway({ activeOnly: true });

        if (!giveaway) {
            throw this.buildError('GIVEAWAY_NOT_FOUND', 'Sorteo no encontrado.');
        }

        if (giveaway.ended) {
            throw this.buildError('GIVEAWAY_ENDED', 'El sorteo ya finalizo.');
        }

        if (!giveaway.participants.has(userId)) {
            throw this.buildError('USER_NOT_IN_GIVEAWAY', 'El usuario no esta participando en este sorteo.');
        }

        giveaway.participants.delete(userId);
        this.giveaways.set(giveaway.messageId, giveaway);
        await this.updateParticipantsField(null, giveaway);

        const message = await this.getOrFetchGiveawayMessage(giveaway);
        const channel = message?.channel ?? await this.client.resolveChannel(giveaway.channelId);

        return { giveaway, message, channel };
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

            // Verificar rol requerido o bloqueado si aplica
            let member = null;
            if (giveaway.requiredRole || giveaway.excludedRole) {
                try {
                    member = await interaction.guild.members.fetch(interaction.user.id);
                } catch (e) {
                    console.error('Error obteniendo el miembro para verificar roles:', e.message);
                    return interaction.reply({ content: '❌ Error al verificar tus roles. Intenta de nuevo.', ephemeral: true });
                }
            }

            if (giveaway.requiredRole && member && !member.roles.cache.has(giveaway.requiredRole)) {
                return interaction.reply({
                    content: `❌ Necesitas el rol <@&${giveaway.requiredRole}> para participar en este sorteo.`,
                    ephemeral: true
                });
            }

            if (giveaway.excludedRole && member && member.roles.cache.has(giveaway.excludedRole)) {
                return interaction.reply({
                    content: `❌ El rol <@&${giveaway.excludedRole}> no puede participar en este sorteo.`,
                    ephemeral: true
                });
            }

            // Verificar invites requeridos si aplica
            if (giveaway.requiredInvites && giveaway.requiredInvites > 0) {
                try {
                    const uses = await this.client.getInviteUses(interaction.guild, interaction.user.id, {
                        ttl: INVITE_USAGE_TTL_MS
                    });
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
            const targetMessage = message ?? await this.getOrFetchGiveawayMessage(giveaway);

            if (!targetMessage || !targetMessage.embeds.length) return;

            const updatedEmbed = EmbedBuilder.from(targetMessage.embeds[0]);
            const fields = updatedEmbed.data.fields ? [...updatedEmbed.data.fields] : [];
            const participantIndex = fields.findIndex(field => field.name === PARTICIPANTS_FIELD);
            const participantValue = `${giveaway.participants.size}`;

            if (participantIndex !== -1) {
                fields[participantIndex] = { ...fields[participantIndex], value: participantValue };
            } else {
                fields.push({ name: PARTICIPANTS_FIELD, value: participantValue, inline: false });
            }

            updatedEmbed.setFields(fields);

            await targetMessage.edit({
                embeds: [updatedEmbed],
                components: targetMessage.components
            });

            giveaway.messageCache = targetMessage;
            this.giveaways.set(giveaway.messageId, giveaway);
        } catch (error) {
            console.error('Error actualizando el contador de participantes del sorteo:', error);
        }
    }

    async getOrFetchGiveawayMessage(giveaway) {
        if (!giveaway) return null;

        if (
            giveaway.messageCache &&
            !giveaway.messageCache.partial &&
            giveaway.messageCache.id === giveaway.messageId
        ) {
            return giveaway.messageCache;
        }

        try {
            const channel = await this.client.resolveChannel(giveaway.channelId);
            if (!channel) return null;
            const message = await channel.messages.fetch(giveaway.messageId);
            giveaway.messageCache = message;
            this.giveaways.set(giveaway.messageId, giveaway);
            return message;
        } catch (error) {
            console.error('No se pudo recuperar el mensaje del sorteo:', error);
            return null;
        }
    }
}

module.exports = GiveawayManager;
