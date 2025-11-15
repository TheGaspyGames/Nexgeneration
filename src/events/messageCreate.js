const { Events } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
            // Ignorar mensajes de bots
            if (message.author.bot) return;

            // Incrementar el contador de mensajes del usuario
            if (!message.client.giveawayManager.messageCount.has(message.author.id)) {
                message.client.giveawayManager.messageCount.set(message.author.id, 1);
            } else {
                const currentCount = message.client.giveawayManager.messageCount.get(message.author.id);
                message.client.giveawayManager.messageCount.set(message.author.id, currentCount + 1);
            }

            const normalizedContent = message.content
                .toLowerCase()
                .normalize('NFD')
                .replace(/[^\p{L}\p{N}\s¿?¡!.,:;-]/gu, '')
                .replace(/[¡!¿?.,:;-]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const ipTriggers = [
                'ip',
                'ip del server',
                'ip del servidor',
                'ip server',
                'ip servidor',
                'cual es la ip',
                'cual es la ip del server',
                'cual es la ip del servidor',
                'cual es la ip server',
            ];

            if (normalizedContent && ipTriggers.includes(normalizedContent)) {
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

            // Verificar si la automoderación está activada
            if (!config.autoModeration.enabled) return;

            // Si AI flagging está activado, ejecutar un análisis real (OpenAI si hay API key, sino fallback de palabras)
            if (config.autoModeration.aiFlagging) {
                try {
                    const result = await analyzeMessageForFlagging(message.content, message.client);
                    if (result && result.flagged) {
                        // No sancionamos, solo logueamos internamente en el canal configurado para mod logs
                        const modChannelId = (message.client && message.client.settings && message.client.settings.modLogChannel) || null;
                        const details = result.detail || '';
                        const embedDesc = `Usuario: ${message.author.tag} (${message.author.id})\nGuild: ${message.guild ? message.guild.name : 'DM'}\nCanal: ${message.channel.id}\n\nContenido:\n${message.content.slice(0, 1900)}\n\nDetalle: ${typeof details === 'string' ? details : JSON.stringify(details).slice(0,1900)}`;

                        if (modChannelId) {
                            try {
                                const ch = await message.client.channels.fetch(modChannelId).catch(() => null);
                                if (ch && ch.send) {
                                    const { EmbedBuilder } = require('discord.js');
                                    const embed = new EmbedBuilder()
                                        .setTitle('AutoMod - Mensaje marcado por IA')
                                        .setDescription(embedDesc)
                                        .setColor('#FF0000')
                                        .setTimestamp();
                                    await ch.send({ embeds: [embed] }).catch(() => null);
                                } else {
                                    // fallback: usar client.log (global logs)
                                    await message.client.log('AutoMod - AI Flag', `Mensaje marcado`, embedDesc, { id: message.author.id, tag: message.author.tag });
                                }
                            } catch (e) {
                                console.error('Error enviando mod log:', e.message);
                            }
                        } else {
                            // Si no hay mod channel configurado, usar client.log
                            await message.client.log('AutoMod - AI Flag', `Mensaje marcado en ${message.guild ? message.guild.name : 'DM'}`, embedDesc, { id: message.author.id, tag: message.author.tag });
                        }
                    }
                } catch (e) {
                    console.error('Error en AI flagging:', e.message);
                }
            }

            // Función para análisis de mensajes: intenta OpenAI Moderation y cae a una lista de insultos local (es/en)
            async function analyzeMessageForFlagging(content, client) {
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
                                'Authorization': `Bearer ${apiKey}`
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
                const insults_en = ['idiot','stupid','dumb','loser','shut up','bastard','asshole','fuck you','suck','retard','trash'];
                const insults_es = ['idiota','estúpido','estupido','imbécil','imbecil','gilipollas','tonto','cabrón','cabron','puta','mierda','hijo de puta','culero','pendejo','tarado','idiota'];

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
        const content = message.content.toLowerCase();
        const containsBannedWord = config.autoModeration.bannedWords.some(word => 
            content.includes(word.toLowerCase())
        );

        if (containsBannedWord) {
            await message.delete();
            await message.channel.send({
                content: `⚠️ ${message.author}, tu mensaje contiene palabras prohibidas.`
            }).then(msg => setTimeout(() => msg.delete(), 5000));
            return;
        }

        // Verificar número de líneas
        const lines = message.content.split('\n').length;
        if (lines > config.autoModeration.maxLines) {
            await message.delete();
            await message.channel.send({
                content: `⚠️ ${message.author}, tu mensaje contiene demasiadas líneas. Máximo permitido: ${config.autoModeration.maxLines}`
            }).then(msg => setTimeout(() => msg.delete(), 5000));
            return;
        }
    },
};