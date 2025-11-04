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

client.commands = new Collection();
client.giveaways = new Collection();

// Cargar settings persistentes
const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
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
client.log = async function (type, title, description) {
    try {
        const config = require('../config/config.js');
        const guildId = config.logs && config.logs.guildId;
        const channelId = config.logs && config.logs.channelId;
        if (!guildId || !channelId) return;
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(`${type} - ${title}`)
            .setDescription(description || '')
            .setColor('#FFA500')
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
        console.error('Error enviando log:', err.message);
    }
};

// Cargar comandos
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command);
    }
}

// Función para registrar comandos
async function deployCommands() {
    try {
        console.log(`Iniciando el registro de ${commands.length} comandos.`);

        const rest = new REST().setToken(process.env.TOKEN);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`¡${data.length} comandos registrados exitosamente!`);
    } catch (error) {
        console.error('Error al registrar los comandos:', error);
    }
}

// Cargar eventos
const eventsPath = path.join(__dirname, 'events');
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

client.login(process.env.TOKEN);