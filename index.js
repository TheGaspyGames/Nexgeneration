const { Client, GatewayIntentBits, Partials, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('./config/config.js');
const { TimedCache, BackgroundQueue } = require('./src/utils/performance');
const { loadSlashCommands, registerSlashCommands } = require('./src/utils/commandRegistration');

const CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000;
const GUILD_CACHE_TTL_MS = 15 * 60 * 1000;
const INVITE_CACHE_TTL_MS = 30 * 1000;
const INTERNET_CHECK_URL = 'https://www.google.com/generate_204';
const INTERNET_CHECK_INTERVAL_MS = 30 * 1000;
const INTERNET_CHECK_TIMEOUT_MS = 8 * 1000;
const UPTIME_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
const UPTIME_HEARTBEAT_TIMEOUT_MS = 10 * 1000;

const uptimeUrl = process.env.UPTIME || process.env.Uptime || process.env.uptime || null;

const normalizeId = (value) => (value ? value.toString() : null);

const channelCache = new TimedCache(CHANNEL_CACHE_TTL_MS);
const guildCache = new TimedCache(GUILD_CACHE_TTL_MS);
const inviteCache = new TimedCache(INVITE_CACHE_TTL_MS);
const backgroundQueue = new BackgroundQueue();

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

client.performance = {
    channelCache,
    guildCache,
    inviteCache,
    backgroundQueue,
};

client.runInBackground = function (task) {
    backgroundQueue.run(task);
};

client.settings = { suggestionsChannel: null };

client.invalidateChannelCache = (channelId) => {
    const key = normalizeId(channelId);
    if (!key) return;
    channelCache.delete(key);
};

client.invalidateGuildCache = (guildId) => {
    const key = normalizeId(guildId);
    if (!key) return;
    guildCache.delete(key);
};

client.invalidateInviteCache = (guildId) => {
    const key = normalizeId(guildId);
    if (!key) return;
    inviteCache.delete(key);
};

client.resolveChannel = async function (channelId, options = {}) {
    const normalizedId = normalizeId(channelId);
    if (!normalizedId) return null;
    const { force = false, ttl = CHANNEL_CACHE_TTL_MS } = options;

    if (!force) {
        const cached = channelCache.get(normalizedId);
        if (cached) return cached;

        const collectionChannel = client.channels.cache.get(normalizedId);
        if (collectionChannel) {
            return channelCache.set(normalizedId, collectionChannel, ttl);
        }
    } else {
        channelCache.delete(normalizedId);
    }

    try {
        const fetched = await client.channels.fetch(normalizedId);
        if (fetched) {
            channelCache.set(normalizedId, fetched, ttl);
        }
        return fetched ?? null;
    } catch (error) {
        channelCache.delete(normalizedId);
        return null;
    }
};

client.resolveGuild = async function (guildId, options = {}) {
    const normalizedId = normalizeId(guildId);
    if (!normalizedId) return null;
    const { force = false, ttl = GUILD_CACHE_TTL_MS } = options;

    if (!force) {
        const cached = guildCache.get(normalizedId) || client.guilds.cache.get(normalizedId);
        if (cached) {
            guildCache.set(normalizedId, cached, ttl);
            return cached;
        }
    } else {
        guildCache.delete(normalizedId);
    }

    try {
        const fetched = await client.guilds.fetch(normalizedId);
        if (fetched) {
            guildCache.set(normalizedId, fetched, ttl);
        }
        return fetched ?? null;
    } catch (error) {
        guildCache.delete(normalizedId);
        return null;
    }
};

client.getInviteUsageSummary = async function (guildLike, options = {}) {
    const normalizedGuildId = typeof guildLike === 'string'
        ? normalizeId(guildLike)
        : normalizeId(guildLike?.id);
    if (!normalizedGuildId) return new Map();

    const { force = false, ttl = INVITE_CACHE_TTL_MS } = options;

    if (!force) {
        const cached = inviteCache.get(normalizedGuildId);
        if (cached) return cached;
    } else {
        inviteCache.delete(normalizedGuildId);
    }

    const guild = typeof guildLike === 'string'
        ? await client.resolveGuild(guildLike)
        : guildLike;
    if (!guild) return new Map();

    try {
        const invites = await guild.invites.fetch();
        const summary = new Map();
        invites.forEach(invite => {
            const inviterId = invite?.inviter?.id;
            if (!inviterId) return;
            const uses = invite.uses || 0;
            summary.set(inviterId, (summary.get(inviterId) || 0) + uses);
        });
        inviteCache.set(normalizedGuildId, summary, ttl);
        return summary;
    } catch (error) {
        inviteCache.delete(normalizedGuildId);
        throw error;
    }
};

client.getInviteUses = async function (guildLike, userId, options = {}) {
    if (!userId) return 0;
    const summary = await client.getInviteUsageSummary(guildLike, options);
    return summary.get(userId) || 0;
};

client.userCountStats = { nonBot: 0, lastSync: 0 };
client.internetMonitor = { offlineSince: null, lastError: null, interval: null };
client.uptimeHeartbeat = { interval: null };

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
let mongoReconnectAttempt = 0;

const scheduleMongoReconnect = (reason = 'desconocido') => {
    if (mongoReconnectTimeout || !mongoUri) return;

    const delay = Math.min(60000, 5000 * Math.max(1, mongoReconnectAttempt));
    console.warn(`Programando reintento de conexión a MongoDB en ${Math.round(delay / 1000)}s (motivo: ${reason}).`);

    mongoReconnectTimeout = setTimeout(() => {
        mongoReconnectTimeout = null;
        connectToMongo({ force: true });
    }, delay);
};

const connectToMongo = async ({ force = false } = {}) => {
    if (!mongoUri) return;

    if (!force && (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2)) {
        // Ya conectado o conectando
        return;
    }

    try {
        if (force && mongoose.connection.readyState !== 0) {
            try {
                await mongoose.disconnect();
            } catch (disconnectErr) {
                console.error('Error al cerrar la conexión de MongoDB antes de reconectar:', disconnectErr.message || disconnectErr);
            }
        }

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        });
        mongoReconnectAttempt = 0;
        console.log('MongoDB conectado');
        await client.queueStartupLog('MongoDB', 'Conexión establecida', 'MongoDB conectado correctamente.');
    } catch (err) {
        mongoReconnectAttempt++;
        console.error('MongoDB connection error:', err.message);
        await client.queueStartupLog('MongoDB', 'Error de conexión', `No se pudo conectar: ${err.message}`);
        scheduleMongoReconnect('fallo en conexión inicial');
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

const formatDuration = (ms) => {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];

    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
};

const checkInternetConnectivity = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INTERNET_CHECK_TIMEOUT_MS);

    try {
        const response = await fetch(INTERNET_CHECK_URL, { method: 'GET', signal: controller.signal });
        const statusText = response && typeof response.status === 'number'
            ? `status ${response.status}`
            : 'respuesta desconocida';
        const online = Boolean(response);
        return { online, detail: statusText };
    } catch (error) {
        return { online: false, detail: error?.message || 'Error desconocido' };
    } finally {
        clearTimeout(timeoutId);
    }
};

const ensureMongoConnectionHealthy = async () => {
    if (!mongoUri) return;
    if (mongoose.connection.readyState !== 1) {
        await connectToMongo({ force: true });
    }
};

const startInternetMonitor = () => {
    const runCheck = async () => {
        const { online, detail } = await checkInternetConnectivity();

        if (!online) {
            if (!client.internetMonitor.offlineSince) {
                client.internetMonitor.offlineSince = Date.now();
                console.warn(`[INTERNET] Conexi��n perdida: ${detail}`);
            }
            client.internetMonitor.lastError = detail || client.internetMonitor.lastError;
            return;
        }

        const wasOfflineAt = client.internetMonitor.offlineSince;
        const lastError = client.internetMonitor.lastError;
        client.internetMonitor.lastError = null;

        if (!wasOfflineAt) {
            return;
        }

        const downtimeMs = Date.now() - wasOfflineAt;
        const durationText = formatDuration(downtimeMs);
        const detailText = lastError ? ` Ultimo error: ${lastError}` : '';
        const description = `Canal: Logs\nInterior: La conexi��n a internet se restableci�� tras ${durationText}.${detailText ? ` ${detailText}` : ''}`;

        try {
            await client.log('Internet', 'Conexi��n restablecida', description, null);
        } catch (err) {
            console.error('Error enviando log de reconexi��n de internet:', err.message || err);
        }

        client.internetMonitor.offlineSince = null;
        client.internetMonitor.lastError = null;

        try {
            await ensureMongoConnectionHealthy();
        } catch (mongoErr) {
            console.error('Error intentando reconectar MongoDB tras recuperar internet:', mongoErr.message || mongoErr);
        }
    };

    client.runInBackground(runCheck);

    const interval = setInterval(() => {
        client.runInBackground(runCheck);
    }, INTERNET_CHECK_INTERVAL_MS);

    if (interval.unref) {
        interval.unref();
    }

    client.internetMonitor.interval = interval;
};

const startUptimeHeartbeat = () => {
    if (!uptimeUrl) {
        console.log('[UPTIME] Variable UPTIME no definida; se omite heartbeat.');
        return;
    }

    if (client.uptimeHeartbeat.interval) {
        return;
    }

    if (typeof fetch !== 'function') {
        console.warn('[UPTIME] fetch no disponible; se omite heartbeat.');
        return;
    }

    const sendHeartbeat = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPTIME_HEARTBEAT_TIMEOUT_MS);

        try {
            const response = await fetch(uptimeUrl, { method: 'GET', signal: controller.signal });
            const status = typeof response?.status === 'number' ? response.status : 0;

            if (status >= 400) {
                console.warn(`[UPTIME] Heartbeat devolvio status ${status}`);
            }
        } catch (error) {
            console.error('[UPTIME] Error enviando heartbeat:', error?.message || error);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    client.runInBackground(sendHeartbeat);

    const interval = setInterval(() => {
        client.runInBackground(sendHeartbeat);
    }, UPTIME_HEARTBEAT_INTERVAL_MS);

    if (interval.unref) {
        interval.unref();
    }

    client.uptimeHeartbeat.interval = interval;
    console.log('[UPTIME] Heartbeat activo cada 2 minutos.');
};

if (mongoUri) {
    connectToMongo();

    mongoose.connection.on('error', async err => {
        console.error('MongoDB connection error:', err.message || err);
        await client.queueStartupLog('MongoDB', 'Error detectado', `Se perdió la conexión: ${err.message || err}`);
        scheduleMongoReconnect('evento error');
    });

    mongoose.connection.on('disconnected', async () => {
        const warning = 'MongoDB desconectado. Intentando reconectar automáticamente...';
        console.warn(warning);
        await client.queueStartupLog('MongoDB', 'Desconectado', warning);
        scheduleMongoReconnect('evento disconnected');
    });

    mongoose.connection.on('connected', () => {
        mongoReconnectAttempt = 0;
        if (mongoReconnectTimeout) {
            clearTimeout(mongoReconnectTimeout);
            mongoReconnectTimeout = null;
        }
    });

    mongoose.connection.on('reconnected', () => {
        mongoReconnectAttempt = 0;
        console.log('MongoDB reconectado');
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

startInternetMonitor();
startUptimeHeartbeat();

// Cargar comandos (ahora centralizado en ./src/utils/commandRegistration)
const commandsDirectory = path.join(__dirname, 'src', 'commands');
const { commands: loadedCommands, guildCommands: scopedCommands, collection: loadedCollection } = loadSlashCommands(commandsDirectory);
client.commands = loadedCollection;

// Token del bot (acepta TOKEN o DISCORD_TOKEN en .env/entorno)
const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD;
const APPLICATION_ID = process.env.CLIENT_ID || process.env.CLIENTID || process.env.APPLICATION_ID;
const REGISTER_GLOBALLY = process.env.SKIP_GLOBAL_COMMANDS !== 'true';

// Función para registrar comandos (disponible para el bot y para el script manual)
async function deployCommands() {
    try {
        const guildId = process.env.GUILD_ID || (client.settings && client.settings.guildId);

        await registerSlashCommands({
            token: BOT_TOKEN,
            clientId: APPLICATION_ID || (client.user && client.user.id),
            commands: loadedCommands,
            guildCommands: scopedCommands,
            guildId,
            registerGlobally: REGISTER_GLOBALLY,
            debugMode: client.debugMode,
            allowedCommands: client.debugAllowedCommands,
        });

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
