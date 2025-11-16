const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('./config/config.js');

const CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000;
const channelCache = new Map();

const getCachedChannel = (channelId) => {
    const entry = channelCache.get(channelId);
    if (!entry) return null;
    if (entry.expiresAt > Date.now()) {
        return entry.channel;
    }
    channelCache.delete(channelId);
    return null;
};

const cacheChannel = (channelId, channel, ttl = CHANNEL_CACHE_TTL_MS) => {
    if (!channelId || !channel) return channel;
    channelCache.set(channelId, { channel, expiresAt: Date.now() + ttl });
    return channel;
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

client.settings = { suggestionsChannel: null };

client.invalidateChannelCache = (channelId) => {
    const key = channelId ? channelId.toString() : null;
    if (!key) return;
    channelCache.delete(key);
};

client.resolveChannel = async function (channelId, options = {}) {
    if (!channelId) return null;
    const normalizedId = channelId.toString();
    const { force = false, ttl = CHANNEL_CACHE_TTL_MS } = options;

    if (!force) {
        const cached = getCachedChannel(normalizedId);
        if (cached) return cached;

        const collectionChannel = client.channels.cache.get(normalizedId);
        if (collectionChannel) {
            return cacheChannel(normalizedId, collectionChannel, ttl);
        }
    } else {
        client.invalidateChannelCache(normalizedId);
    }

    try {
        const fetched = await client.channels.fetch(normalizedId);
        if (fetched) {
            cacheChannel(normalizedId, fetched, ttl);
        }
        return fetched ?? null;
    } catch (error) {
        client.invalidateChannelCache(normalizedId);
        return null;
    }
};

client.resolveGuild = async function (guildId) {
    if (!guildId) return null;
    const normalizedId = guildId.toString();
    const cached = client.guilds.cache.get(normalizedId);
    if (cached) return cached;

    try {
        return await client.guilds.fetch(normalizedId);
    } catch (error) {
        return null;
    }
};

client.userCountStats = { nonBot: 0, lastSync: 0 };

client.updatePresenceCount = async function (options = {}) {
    if (!client.user) return 0;

    const normalized = typeof options === 'number'
        ? { delta: options }
        : (options || {});

    const delta = normalized.delta ?? 0;
    const force = Boolean(normalized.force);
    const guildId = client.settings?.guildId;
    if (!guildId) {
        return client.userCountStats.nonBot;
    }

    if (force || client.userCountStats.lastSync === 0) {
        const guild = await client.resolveGuild(guildId);
        if (!guild) {
            return client.userCountStats.nonBot;
        }

        let members;
        try {
            members = await guild.members.fetch();
        } catch (error) {
            members = guild.members.cache;
        }

        let nonBotCount = 0;
        members.forEach(member => {
            if (!member.user.bot) {
                nonBotCount++;
            }
        });

        client.userCountStats.nonBot = nonBotCount;
        client.userCountStats.lastSync = Date.now();
    } else if (delta !== 0) {
        client.userCountStats.nonBot = Math.max(0, client.userCountStats.nonBot + delta);
    }

    const activityName = `${client.userCountStats.nonBot} usuarios`;
    try {
        await client.user.setPresence({
            activities: [{
                name: activityName,
                type: ActivityType.Watching
            }],
            status: 'online'
        });
    } catch (error) {
        console.error('Error actualizando la presencia:', error.message || error);
    }

    return client.userCountStats.nonBot;
};

// Conectar a MongoDB si existe MONGODB_URI
const mongoose = require('mongoose');
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || null;

let mongoReconnectTimeout = null;

const scheduleMongoReconnect = () => {
    if (mongoReconnectTimeout || !mongoUri) return;
    mongoReconnectTimeout = setTimeout(() => {
        mongoReconnectTimeout = null;
        connectToMongo();
    }, 5000);
};

const connectToMongo = async () => {
    if (!mongoUri) return;

    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        // Ya conectado o conectando
        return;
    }

    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB conectado');
        await client.queueStartupLog('MongoDB', 'Conexión establecida', 'MongoDB conectado correctamente.');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        await client.queueStartupLog('MongoDB', 'Error de conexión', `No se pudo conectar: ${err.message}`);
        scheduleMongoReconnect();
    }
};

client.commands = new Collection();
client.giveaways = new Collection();
client.autoModReviewActions = new Map();

client.debugAllowedCommands = new Set(['update']);
client.debugMode = false;
client.debugState = null;
client.pendingDebugNotification = false;
client.debugNotificationSent = false;
client.startupPhase = true;
client.startupErrorTriggered = false;
client.debugModeRestored = false;

const debugStatePath = path.join(__dirname, 'config', 'debug-state.json');
const defaultDebugState = {
    active: false,
    reason: null,
    errorMessage: null,
    activatedAt: null,
    triggeredDuringStartup: false,
};

const readDebugStateFromDisk = () => {
    try {
        if (!fs.existsSync(debugStatePath)) {
            return { ...defaultDebugState };
        }

        const raw = fs.readFileSync(debugStatePath, 'utf8').trim();
        if (raw.length === 0) {
            return { ...defaultDebugState };
        }

        const parsed = JSON.parse(raw);
        return { ...defaultDebugState, ...parsed };
    } catch (err) {
        console.error('No se pudo leer debug-state.json:', err.message);
        return { ...defaultDebugState };
    }
};

const persistDebugState = (state) => {
    try {
        const payload = { ...defaultDebugState, ...state };
        fs.writeFileSync(debugStatePath, JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('No se pudo guardar debug-state.json:', err.message);
    }
};

if (!fs.existsSync(debugStatePath)) {
    persistDebugState(defaultDebugState);
}

const initialDebugState = readDebugStateFromDisk();
if (initialDebugState.active) {
    client.debugMode = true;
    client.debugState = initialDebugState;
    client.pendingDebugNotification = true;
    client.debugModeRestored = true;
}

client.buildDebugDescription = () => {
    if (!client.debugState) {
        return 'Canal: Logs\nInterior: Activado automáticamente en modo debug.';
    }

    const { reason, errorMessage } = client.debugState;
    const details = [];

    if (reason) {
        details.push(`Motivo: ${reason}`);
    }

    if (errorMessage) {
        const trimmed = errorMessage.length > 1800 ? `${errorMessage.slice(0, 1800)}…` : errorMessage;
        details.push(`Detalle: ${trimmed}`);
    }

    if (details.length === 0) {
        details.push('Detalle: No disponible');
    }

    return `Canal: Logs\nInterior: Activado automáticamente en modo debug.\n${details.join('\n')}`;
};

const notifyDebugMode = async () => {
    if (!client.debugMode || client.debugNotificationSent) {
        return;
    }

    try {
        await client.log('Modo debug activado', 'Bot en modo debug', client.buildDebugDescription(), null);
        client.debugNotificationSent = true;
    } catch (err) {
        console.error('Error enviando log de modo debug:', err.message);
    }
};

const enterDebugMode = async (reason, error) => {
    if (client.debugMode) {
        return;
    }

    const errorMessage = error && error.message ? error.message : (typeof error === 'string' ? error : null);

    client.debugMode = true;
    client.debugState = {
        reason: reason || 'Error no especificado',
        errorMessage,
        activatedAt: new Date().toISOString(),
        triggeredDuringStartup: client.startupPhase,
    };
    client.pendingDebugNotification = true;
    client.startupErrorTriggered = client.startupErrorTriggered || client.startupPhase;

    persistDebugState({
        active: true,
        ...client.debugState,
    });

    console.error('[MODO DEBUG] Activado automáticamente debido a un error:', {
        reason: client.debugState.reason,
        error: errorMessage || 'sin detalle',
    });

    if (client.isReady()) {
        client.pendingDebugNotification = false;
        await notifyDebugMode();
        await deployCommands();
    }
};

const exitDebugMode = async (options = {}) => {
    if (!client.debugMode) {
        persistDebugState({ active: false });
        client.debugModeRestored = false;
        return;
    }

    client.debugMode = false;
    client.debugState = null;
    client.pendingDebugNotification = false;
    client.debugNotificationSent = false;
    client.debugModeRestored = false;
    client.startupErrorTriggered = false;

    const description = `Canal: Logs\nInterior: ${options.reason || 'Modo debug desactivado automáticamente tras reinicio.'}`;

    persistDebugState({
        active: false,
        clearedAt: new Date().toISOString(),
        clearedReason: options.reason || 'Reinicio completado',
    });

    if (!options.skipLog) {
        try {
            await client.log('Modo debug desactivado', 'Bot operativo', description, options.executor || null);
        } catch (err) {
            console.error('Error enviando log de desactivación de modo debug:', err.message);
        }
    }

    if (!options.skipCommandDeploy) {
        await deployCommands();
    }
};

client.enterDebugMode = enterDebugMode;
client.notifyDebugMode = notifyDebugMode;
client.exitDebugMode = exitDebugMode;

// Cargar settings persistentes (ruta relativa a la raíz)
const settingsPath = path.join(__dirname, 'config', 'settings.json');
let settings = { suggestionsChannel: null };
try {
    if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
} catch (e) {
    console.warn('No se pudo leer settings.json:', e.message);
}
client.settings = settings;

// Helper para enviar logs internos al canal de logs configurado
client.log = async function (type, title, description, executor) {
    try {
        const guildId = config.logs && config.logs.guildId;
        const channelId = config.logs && config.logs.channelId;

        if (!guildId || !channelId) {
            console.warn('[LOGS] No se encontró configuración de logs en config.js');
            return;
        }

        const channel = await client.resolveChannel(channelId);
        if (!channel || channel.guildId !== guildId || typeof channel.send !== 'function') {
            console.error(`[LOGS] No se pudo obtener el canal ${channelId} para enviar logs.`);
            return;
        }

        const me = channel.guild?.members?.me;
        const permissions = me ? channel.permissionsFor(me) : null;
        if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel') || !permissions.has('EmbedLinks')) {
            console.error('[LOGS] El bot no tiene los permisos necesarios en el canal de logs.');
            return;
        }

        const channelRaw = description && description.includes('Canal:') ? description.split('Canal: ')[1].split('\n')[0] : 'N/A';
        const interiorLine = description && description.split('\n').find(line => line.startsWith('Interior:'));
        const interior = interiorLine ? interiorLine.replace('Interior: ', '') : '';
        const channelDisplay = /^\d+$/.test(channelRaw) ? `<#${channelRaw}>` : channelRaw;

        const embed = new EmbedBuilder()
            .setTitle(`📝 ${type}`)
            .setColor('#3498db')
            .setTimestamp();

        if (executor && executor.id) {
            embed.addFields([{ name: 'Usuario', value: `${executor.tag || executor.name || 'Desconocido'}\nID: ${executor.id}`, inline: false }]);
        } else {
            embed.addFields([{ name: 'Usuario', value: 'Desconocido', inline: false }]);
        }

        embed.addFields([
            { name: 'Comando', value: title || 'N/A', inline: true },
            { name: 'Canal', value: channelDisplay, inline: true }
        ]);

        if (interior) {
            embed.addFields([{ name: 'Interior', value: interior, inline: false }]);
        }

        await channel.send({ embeds: [embed] }).catch(error => {
            console.error('No se pudo enviar el log:', error.message || error);
        });
    } catch (err) {
        console.error('Error enviando log:', err.message);
    }
};

client.startupLogEntries = [];
client.startupLogsFlushed = false;

client.queueStartupLog = function (type, title, description, options = {}) {
    const fallbackChannel = options.channel || 'Logs';
    const rawDescription = typeof description === 'string' && description.trim().length > 0
        ? description
        : 'Sin detalles adicionales.';
    const interiorText = typeof options.interior === 'string' && options.interior.trim().length > 0
        ? options.interior.trim()
        : rawDescription;

    const formattedDescription = (/Canal:/i.test(rawDescription) && /Interior:/i.test(rawDescription))
        ? rawDescription
        : `Canal: ${fallbackChannel}\nInterior: ${interiorText}`;

    const trimmedSummarySource = options.summary || interiorText;
    const summary = trimmedSummarySource.length > 300
        ? `${trimmedSummarySource.slice(0, 297)}…`
        : trimmedSummarySource;

    const entry = {
        type: type || 'Estado',
        title: title || 'Inicio',
        description: formattedDescription,
        summary,
        channel: fallbackChannel
    };

    if (client.startupLogsFlushed && client.isReady()) {
        return client.log(entry.type, entry.title, entry.description, null).catch(err => {
            console.error('Error enviando log encolado:', err.message);
        });
    }

    client.startupLogEntries.push(entry);
    return Promise.resolve();
};

client.flushStartupLogs = async function () {
    if (client.startupLogsFlushed) {
        return;
    }

    client.startupLogsFlushed = true;

    if (!Array.isArray(client.startupLogEntries) || client.startupLogEntries.length === 0) {
        client.startupLogEntries = [];
        return;
    }

    const entries = [...client.startupLogEntries];
    client.startupLogEntries = [];

    for (const entry of entries) {
        try {
            await client.log(entry.type, entry.title, entry.description, null);
        } catch (err) {
            console.error('Error enviando log de inicio:', err.message);
        }
    }

    try {
        const summaryLines = entries
            .map(entry => `• [${entry.type}] ${entry.title}: ${entry.summary}`)
            .join('\n');

        if (summaryLines.trim().length > 0) {
            await client.log(
                'Estado',
                'Resumen de inicio',
                `Canal: ${entries[0]?.channel || 'Logs'}\nInterior: ${summaryLines}`,
                null
            );
        }
    } catch (err) {
        console.error('Error enviando resumen de inicio:', err.message);
    }
};

if (mongoUri) {
    connectToMongo();

    mongoose.connection.on('error', async err => {
        console.error('MongoDB connection error:', err.message || err);
        await client.queueStartupLog('MongoDB', 'Error detectado', `Se perdió la conexión: ${err.message || err}`);
        scheduleMongoReconnect();
    });

    mongoose.connection.on('disconnected', async () => {
        const warning = 'MongoDB desconectado. Intentando reconectar automáticamente...';
        console.warn(warning);
        await client.queueStartupLog('MongoDB', 'Desconectado', warning);
        scheduleMongoReconnect();
    });
} else {
    const notice = 'MONGODB_URI no configurado, usando almacenamiento en archivos si está implementado.';
    console.log(notice);
    client.queueStartupLog('MongoDB', 'Sin configuración', notice);
}

client.connectionLostAt = null;

const notifyConnectionRecovery = async (shardId, originEvent) => {
    if (!client.connectionLostAt) return;

    const downtimeMs = Date.now() - client.connectionLostAt;
    const downtimeSeconds = Math.max(1, Math.round(downtimeMs / 1000));
    const description = `Canal: Logs\nInterior: Conexión restablecida (${originEvent}) tras ${downtimeSeconds} segundos. Shard: ${shardId}`;

    try {
        await client.log('Conexión restaurada', `Shard ${shardId} reconectado`, description, null);
    } catch (err) {
        console.error('Error enviando log de reconexión:', err.message);
    } finally {
        client.connectionLostAt = null;
    }
};

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`Shard ${shardId} desconectado. Código: ${event?.code ?? 'desconocido'}`);
    if (!client.connectionLostAt) {
        client.connectionLostAt = Date.now();
    }
});

client.on('shardResume', shardId => notifyConnectionRecovery(shardId, 'resume'));
client.on('shardReady', shardId => notifyConnectionRecovery(shardId, 'ready'));

client.on('error', error => {
    console.error('Discord client error:', error);
    client.enterDebugMode('Error del cliente de Discord', error);
});

client.on('shardError', (error, shardId) => {
    console.error(`Error en el shard ${shardId}:`, error);
    client.enterDebugMode(`Error en shard ${shardId}`, error);
});

// Cargar comandos (ahora en ./src/commands)
const commandData = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        const jsonData = command.data.toJSON();
        commandData.push(jsonData);
        client.commands.set(command.data.name, command);
    }
}

// Token del bot (acepta TOKEN o DISCORD_TOKEN en .env/entorno)
const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD;

// Función para registrar comandos
async function deployCommands() {
    try {
        const body = client.debugMode
            ? commandData.filter(cmd => client.debugAllowedCommands.has(cmd.name))
            : commandData;
        const countText = client.debugMode
            ? `${body.length} (modo debug activo)`
            : `${commandData.length}`;
        console.log(`Iniciando el registro de ${countText} comandos.`);

        if (client.debugMode && body.length === 0) {
            console.warn('Modo debug activo pero no se encontraron comandos permitidos.');
        }

        const rest = new REST().setToken(BOT_TOKEN);
        // Determinar applicationId y guildId (priorizar env, luego settings, luego client)
        const appId = process.env.CLIENT_ID || process.env.CLIENTID || (client.user && client.user.id);
        const guildId = process.env.GUILD_ID || client.settings && client.settings.guildId;

        if (!appId) {
            console.warn('No se pudo determinar el application ID para registrar comandos. Se omitirá el registro.');
            return;
        }

        let data;
        if (guildId) {
            data = await rest.put(
                Routes.applicationGuildCommands(appId, guildId),
                { body },
            );
            console.log(`Comandos ${client.debugMode ? 'deshabilitados' : 'registrados'} exitosamente en el servidor ${guildId} (${data.length}).`);
        } else {
            // Registrar globalmente si no hay guild configurado
            data = await rest.put(
                Routes.applicationCommands(appId),
                { body },
            );
            console.log(`Comandos ${client.debugMode ? 'deshabilitados globalmente' : 'registrados globalmente'} (${data.length}).`);
        }

        if (client.debugMode) {
            await notifyDebugMode();
        }
    } catch (error) {
        console.error('Error al registrar los comandos:', error);
    }
}

// Cargar eventos (ahora en ./src/events)
const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Registrar comandos al iniciar y conectar el bot
client.once('ready', async () => {
    client.startupPhase = false;
    await client.flushStartupLogs();

    if (client.pendingDebugNotification) {
        client.pendingDebugNotification = false;
        await notifyDebugMode();
    }

    await deployCommands();

    if (client.debugMode && client.debugModeRestored && !client.startupErrorTriggered) {
        await client.exitDebugMode({
            reason: 'Reinicio completado sin errores detectados.',
        });
    }
});

// Iniciar sesión con el token resuelto
if (!BOT_TOKEN) {
    console.error('ERROR: No se encontró el token del bot. Define TOKEN o DISCORD_TOKEN en .env o en las variables de entorno.');
    process.exit(1);
}

client.login(BOT_TOKEN);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection detectada:', error);
    client.enterDebugMode('Unhandled promise rejection', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception detectada:', error);
    client.enterDebugMode('Uncaught exception', error);
});
