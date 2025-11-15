const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        scheduleMongoReconnect();
    }
};

if (mongoUri) {
    connectToMongo();

    mongoose.connection.on('error', err => {
        console.error('MongoDB connection error:', err.message || err);
        scheduleMongoReconnect();
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB desconectado. Intentando reconectar automáticamente...');
        scheduleMongoReconnect();
    });
} else {
    console.log('MONGODB_URI no configurado, usando almacenamiento en archivos si está implementado.');
}

client.commands = new Collection();
client.giveaways = new Collection();

client.debugMode = false;
client.debugState = null;
client.pendingDebugNotification = false;
client.debugNotificationSent = false;

const buildDebugDescription = () => {
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
        await client.log('Modo debug activado', 'Bot en modo debug', buildDebugDescription(), null);
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
    };
    client.pendingDebugNotification = true;

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

client.enterDebugMode = enterDebugMode;
client.notifyDebugMode = notifyDebugMode;

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
        const config = require('./config/config.js');
        const guildId = config.logs && config.logs.guildId;
        const channelId = config.logs && config.logs.channelId;

        // Debug: Verificar configuración
        console.log('[DEBUG] Configuración de logs:', {
            guildId: guildId || 'No configurado',
            channelId: channelId || 'No configurado'
        });

        if (!guildId || !channelId) {
            console.warn('[LOGS] No se encontró configuración de logs en config.js');
            return;
        }

        const guild = await client.guilds.fetch(guildId).catch(e => {
            console.error('[LOGS] Error al obtener guild:', e.message);
            return null;
        });
        
        if (!guild) {
            console.error(`[LOGS] No se pudo encontrar el servidor ${guildId}`);
            return;
        }

        const channel = await guild.channels.fetch(channelId).catch(e => {
            console.error('[LOGS] Error al obtener canal:', e.message);
            return null;
        });
        
        if (!channel) {
            console.error(`[LOGS] No se pudo encontrar el canal ${channelId} en el servidor ${guild.name}`);
            return;
        }

        // Debug: Verificar permisos
        const permissions = channel.permissionsFor(guild.members.me);
        if (!permissions.has('SendMessages') || !permissions.has('ViewChannel') || !permissions.has('EmbedLinks')) {
            console.error('[LOGS] El bot no tiene los permisos necesarios en el canal de logs:', {
                SendMessages: permissions.has('SendMessages'),
                ViewChannel: permissions.has('ViewChannel'),
                EmbedLinks: permissions.has('EmbedLinks')
            });
            return;
        }
        const { EmbedBuilder } = require('discord.js');

        // Parsear canal e interior desde la descripción
        const channelRaw = description && description.includes('Canal:') ? description.split('Canal: ')[1].split('\n')[0] : 'N/A';
        const interiorLine = description && description.split('\n').find(line => line.startsWith('Interior:'));
        const interior = interiorLine ? interiorLine.replace('Interior: ', '') : '';

        const channelDisplay = /^\d+$/.test(channelRaw) ? `<#${channelRaw}>` : channelRaw;

        const embed = new EmbedBuilder()
            .setTitle(`📝 ${type}`)
            .setColor('#3498db')
            .setTimestamp();

        // Usuario
        if (executor && executor.id) {
            embed.addFields([{ name: 'Usuario', value: `${executor.tag || executor.name || 'Desconocido'}\nID: ${executor.id}`, inline: false }]);
        } else {
            embed.addFields([{ name: 'Usuario', value: 'Desconocido', inline: false }]);
        }

        // Comando y canal
        embed.addFields([
            { name: 'Comando', value: title || 'N/A', inline: true },
            { name: 'Canal', value: channelDisplay, inline: true }
        ]);

        // Interior (argumentos)
        if (interior) {
            embed.addFields([{ name: 'Interior', value: interior, inline: false }]);
        }

        console.log(`[DEBUG] Enviando log a ${channelId}:`, { type, title, channelRaw, interior, executor: executor ? `${executor.tag} (${executor.id})` : 'No executor' });

        await channel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
        console.error('Error enviando log:', err.message);
    }
};

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
const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command);
    }
}

// Token del bot (acepta TOKEN o DISCORD_TOKEN en .env/entorno)
const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD;

// Función para registrar comandos
async function deployCommands() {
    try {
        const body = client.debugMode ? [] : commands;
        const countText = client.debugMode ? '0 (modo debug activo)' : `${commands.length}`;
        console.log(`Iniciando el registro de ${countText} comandos.`);

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
    console.log(`¡Bot listo! Conectado como ${client.user.tag}`);

    if (client.pendingDebugNotification) {
        client.pendingDebugNotification = false;
        await notifyDebugMode();
    }

    await deployCommands();
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
