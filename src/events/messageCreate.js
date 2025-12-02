const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.js');
const automodCache = require('../utils/automodCache');

const IP_TRIGGER_SET = new Set([
    'ip',
    'ip del server',
    'ip del servidor',
    'ip server',
    'ip servidor',
    'cual es la ip',
    'cual es la ip del server',
    'cual es la ip del servidor',
    'cual es la ip server'
]);
const IP_RESPONSE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignorar mensajes de bots
        if (message.author.bot) return;

        // Incrementar el contador de mensajes del usuario (si el manager está disponible)
        const giveawayManager = message.client.giveawayManager;
        if (giveawayManager) {
            const previousCount = giveawayManager.messageCount.get(message.author.id) || 0;
            giveawayManager.messageCount.set(message.author.id, previousCount + 1);
        }

        const rawContent = message.content || '';
        const loweredContent = rawContent.toLowerCase();

        if (loweredContent.includes('ip')) {
            const normalizedContent = normalizeContentForIp(rawContent);
            if (normalizedContent && IP_TRIGGER_SET.has(normalizedContent)) {
                if (!message.client.ipResponseCooldowns) {
                    message.client.ipResponseCooldowns = new Map();
                }

                const now = Date.now();
                const cooldownKey = message.guild ? `guild:${message.guild.id}` : `user:${message.author.id}`;
                const lastTrigger = message.client.ipResponseCooldowns.get(cooldownKey);

                if (lastTrigger && (now - lastTrigger) < IP_RESPONSE_COOLDOWN_MS) {
                    return;
                }

                message.client.ipResponseCooldowns.set(cooldownKey, now);

                const response = [
                    `Hola ${message.author} la ip es la siguiente`,
                    'Java: `nexgneration.sdlf.fun`',
                    'Bedrock: `nexgneration.sdlf.fun` o `ns570401.seedloaf.com`',
                    'Puerto: `49376`',
                    '',
                    'Las versiones disponibles son de la 1.12 en adelante!',
                    '',
                    'Pásala bien en el server!<:gato_mirada:1192169587932934344>'
                ].join('\n');

                await message.reply({ content: response });
                return;
            }
        }

        // Verificar si la automoderación está activada
        if (!config.autoModeration.enabled) return;

        // Ignorar usuarios o roles exentos del automod
        if (config.autoModeration.ignoredUsers.includes(message.author.id)) {
            return;
        }

        if (message.member && message.member.roles.cache.some(role => config.autoModeration.ignoredRoles.includes(role.id))) {
            return;
        }

        // Si AI flagging está activado, ejecutar la verificación en segundo plano
        if (config.autoModeration.aiFlagging && typeof message.client.runInBackground === 'function') {
            message.client.runInBackground(async () => {
                try {
                    const result = await analyzeMessageForFlagging(rawContent, message.client);
                    if (!result || !result.flagged) {
                        return;
                    }

                    const modChannelId = message.client?.settings?.modLogChannel || null;
                    const details = result.detail || '';
                    const embedDesc = `Usuario: ${message.author.tag} (${message.author.id})\nGuild: ${message.guild ? message.guild.name : 'DM'}\nCanal: ${message.channel.id}\n\nContenido:\n${rawContent.slice(0, 1900)}\n\nDetalle: ${typeof details === 'string' ? details : JSON.stringify(details).slice(0, 1900)}`;

                    if (modChannelId) {
                        try {
                            const ch = await message.client.resolveChannel(modChannelId);
                            if (ch && typeof ch.send === 'function') {
                                const embed = new EmbedBuilder()
                                    .setTitle('AutoMod - Mensaje marcado por IA')
                                    .setDescription(embedDesc)
                                    .setColor('#FF0000')
                                    .setTimestamp();
                                await ch.send({ embeds: [embed] }).catch(() => null);
                                return;
                            }
                        } catch (e) {
                            console.error('Error enviando mod log:', e.message);
                        }
                    }

                    await message.client.log('AutoMod - AI Flag', `Mensaje marcado en ${message.guild ? message.guild.name : 'DM'}`, embedDesc, { id: message.author.id, tag: message.author.tag });
                } catch (e) {
                    console.error('Error en AI flagging:', e.message);
                }
            });
        }

        // Verificar menciones excesivas
        const mentions = message.mentions.users.size + message.mentions.roles.size;
        if (mentions > config.autoModeration.maxMentions) {
            await message.delete();
            await message.channel.send({
                content: `⚠️ ${message.author}, no se permiten más de ${config.autoModeration.maxMentions} menciones por mensaje.`
            }).then(msg => setTimeout(() => msg.delete(), 5000));
            return;
        }

        // Verificar palabras prohibidas
        const matchedBannedWords = [...new Set(automodCache.getMatches(loweredContent))];

        if (matchedBannedWords.length) {
            await message.delete();
            await message.channel.send({
                content: `⚠️ ${message.author}, tu mensaje contiene palabras prohibidas.`
            }).then(msg => setTimeout(() => msg.delete(), 5000));

            const highlightedMessage = automodCache.highlight(rawContent);
            const displayName = (message.member && message.member.displayName) || message.author.tag;
            const reportChannelId = config.autoModeration.reportChannelId;
            const reviewChannelId = config.autoModeration.reviewChannelId;

            if (reportChannelId) {
                try {
                    const reportChannel = await message.client.resolveChannel(reportChannelId);
                    if (reportChannel && typeof reportChannel.send === 'function') {
                        await reportChannel.send({ embeds: [createAutomodEmbed(message, displayName, highlightedMessage)] });
                    }
                } catch (error) {
                    console.error('No se pudo enviar el log de automod:', error);
                }
            }

            if (reviewChannelId) {
                try {
                    const reviewChannel = await message.client.resolveChannel(reviewChannelId);
                    if (reviewChannel && typeof reviewChannel.send === 'function') {
                        if (!message.client.autoModReviewActions) {
                            message.client.autoModReviewActions = new Map();
                        }

                        const reviewId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                        const normalizedMatches = matchedBannedWords.map(word => word.toLowerCase());
                        message.client.autoModReviewActions.set(reviewId, {
                            words: normalizedMatches,
                        });

                        const cleanupTimeout = setTimeout(() => {
                            message.client.autoModReviewActions.delete(reviewId);
                        }, 24 * 60 * 60 * 1000);
                        if (cleanupTimeout.unref) cleanupTimeout.unref();

                        const buttonsRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`automod-review:good:${reviewId}`)
                                .setLabel('Buen insulto')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`automod-review:bad:${reviewId}`)
                                .setLabel('Mal insulto')
                                .setStyle(ButtonStyle.Danger)
                        );

                        await reviewChannel.send({
                            embeds: [createAutomodEmbed(message, displayName, highlightedMessage)],
                            components: [buttonsRow]
                        });
                    }
                } catch (error) {
                    console.error('No se pudo enviar el log de revisión de automod:', error);
                }
            }
            return;
        }

        // Verificar número de líneas
        const lines = rawContent.split('\n').length;
        if (lines > config.autoModeration.maxLines) {
            await message.delete();
            await message.channel.send({
                content: `⚠️ ${message.author}, tu mensaje contiene demasiadas líneas. Máximo permitido: ${config.autoModeration.maxLines}`
            }).then(msg => setTimeout(() => msg.delete(), 5000));
            return;
        }
    },
};

function createAutomodEmbed(message, displayName, highlightedMessage) {
    const embed = new EmbedBuilder()
        .setTitle('Automod')
        .setColor('#FF0000')
        .addFields(
            {
                name: 'Usuario',
                value: `${message.author.id} - ${displayName}`,
                inline: false
            },
            {
                name: 'Lo que dijo',
                value: highlightedMessage.slice(0, 1024) || '*Sin contenido*',
                inline: false
            }
        )
        .setTimestamp();

    if (message.guild) {
        embed.setFooter({
            text: `Servidor: ${message.guild.name} | Canal: #${message.channel?.name || message.channel.id}`
        });
    }

    return embed;
}

async function analyzeMessageForFlagging(content, _client) {
    if (!content) return { flagged: false };
    const lowered = content.toLowerCase();

    // Si hay OPENAI_API_KEY, usar la API de moderación
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || null;
    if (apiKey) {
        try {
            const res = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({ model: 'omni-moderation-latest', input: content })
            });
            const data = await res.json();
            if (data && data.results && data.results[0]) {
                const r = data.results[0];
                if (r.flagged) return { flagged: true, provider: 'openai', detail: r };
            }
        } catch (err) {
            console.error('OpenAI moderation error:', err.message);
            // continuar al fallback
        }
    }

    // Fallback: listas simples de insultos/spam en inglés y español
    const insults_en = ['idiot', 'stupid', 'dumb', 'loser', 'shut up', 'bastard', 'asshole', 'fuck you', 'suck', 'retard', 'trash'];
    const insults_es = ['idiota', 'estúpido', 'estupido', 'imbécil', 'imbecil', 'gilipollas', 'tonto', 'cabrón', 'cabron', 'puta', 'mierda', 'hijo de puta', 'culero', 'pendejo', 'tarado', 'idiota'];

    for (const w of insults_en) {
        if (lowered.includes(w)) return { flagged: true, provider: 'keywords', detail: w };
    }
    for (const w of insults_es) {
        if (lowered.includes(w)) return { flagged: true, provider: 'keywords', detail: w };
    }

    // También marcar si hay muchas menciones como antes
    const mentionCount = (content.match(/<@[!&]?\d+>/g) || []).length;
    if (mentionCount >= 5) return { flagged: true, provider: 'mentions', detail: `mentions:${mentionCount}` };

    return { flagged: false };
}

function normalizeContentForIp(content) {
    return content
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^\p{L}\p{N}\s¿?¡!.,:;-]/gu, '')
        .replace(/[¡!¿?.,:;-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
