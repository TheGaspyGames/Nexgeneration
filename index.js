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
if (mongoUri) {
    mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => console.log('MongoDB conectado')).catch(err => console.error('MongoDB connection error:', err.message));
} else {
    console.log('MONGODB_URI no configurado, usando almacenamiento en archivos si está implementado.');
}

client.commands = new Collection();
client.giveaways = new Collection();

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
        if (!guildId || !channelId) return;
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const { EmbedBuilder } = require('discord.js');
        let desc = description || '';
        if (executor && executor.id) {
            desc += `\n\nEjecutado por: ${executor.tag || executor.name || ''} (id: ${executor.id})`;
        }
        const embed = new EmbedBuilder()
            .setTitle(`${type} - ${title}`)
            .setDescription(desc)
            .setColor('#FFA500')
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
        console.error('Error enviando log:', err.message);
    }
};

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
        console.log(`Iniciando el registro de ${commands.length} comandos.`);

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
                { body: commands },
            );
            console.log(`¡${data.length} comandos registrados exitosamente en el servidor ${guildId}!`);
        } else {
            // Registrar globalmente si no hay guild configurado
            data = await rest.put(
                Routes.applicationCommands(appId),
                { body: commands },
            );
            console.log(`¡${data.length} comandos registrados globalmente! (puede tardar hasta 1 hora en propagarse)`);
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
client.once('ready', () => {
    console.log(`¡Bot listo! Conectado como ${client.user.tag}`);
    deployCommands();
});

// Iniciar sesión con el token resuelto
if (!BOT_TOKEN) {
    console.error('ERROR: No se encontró el token del bot. Define TOKEN o DISCORD_TOKEN en .env o en las variables de entorno.');
    process.exit(1);
}

client.login(BOT_TOKEN);
