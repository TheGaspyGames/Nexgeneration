/**
 * Script de despliegue manual de slash commands.
 * Uso rápido:
 *   node deploy-commands.js               -> Registra global y en el GUILD_ID (si existe)
 *   node deploy-commands.js --guild-only  -> Solo registra en el GUILD_ID (actualización inmediata)
 *   node deploy-commands.js --global-only -> Solo registra globalmente
 */
require('dotenv').config();
const path = require('path');
const { loadSlashCommands, registerSlashCommands } = require('./src/utils/commandRegistration');
const settings = require('./config/settings.json');

const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD;
const APPLICATION_ID = process.env.CLIENT_ID || process.env.CLIENTID || process.env.APPLICATION_ID;
const settingsGuildId = settings.guildId ? settings.guildId.toString() : null;
const envGuildId = process.env.GUILD_ID || process.env.GUILDID;
const guildId = envGuildId ? envGuildId.toString() : settingsGuildId;

const args = process.argv.slice(2);
const guildOnly = args.includes('--guild-only') || args.includes('--guild');
const globalOnly = args.includes('--global-only') || args.includes('--global');
const registerGlobally = !guildOnly && !args.includes('--skip-global');
const shouldUseGuild = Boolean(guildId) && !globalOnly;

(async () => {
    try {
        const commandsDirectory = path.join(__dirname, 'src', 'commands');
        const { commands, guildCommands } = loadSlashCommands(commandsDirectory);

        await registerSlashCommands({
            token: BOT_TOKEN,
            clientId: APPLICATION_ID,
            commands,
            guildCommands,
            guildId: shouldUseGuild ? guildId : null,
            registerGlobally,
        });

        console.log('[deploy] Despliegue completado. Los comandos de guild aparecen al instante; los globales pueden tardar unos minutos.');
    } catch (error) {
        console.error('[deploy] No se pudieron registrar los comandos:', error);
        process.exit(1);
    }
})();
