const fs = require('fs');
const path = require('path');
const { Collection, REST, Routes } = require('discord.js');

async function cleanupOrphanCommands(rest, clientId, allowedNames, targetGuildId = null) {
    if (!allowedNames || allowedNames.size === 0) return 0;

    const listRoute = targetGuildId
        ? Routes.applicationGuildCommands(clientId, targetGuildId)
        : Routes.applicationCommands(clientId);
    const deleteRoute = (commandId) => targetGuildId
        ? Routes.applicationGuildCommand(clientId, targetGuildId, commandId)
        : Routes.applicationCommand(clientId, commandId);

    const existing = await rest.get(listRoute);
    const toDelete = existing.filter(cmd => !allowedNames.has(cmd.name));
    if (!toDelete.length) return 0;

    for (const cmd of toDelete) {
        try {
            await rest.delete(deleteRoute(cmd.id));
            const scopeText = targetGuildId ? `guild ${targetGuildId}` : 'global';
            console.log(`[deploy] Eliminado comando huérfano "${cmd.name}" (${cmd.id}) en ${scopeText}.`);
        } catch (err) {
            console.warn(`[deploy] No se pudo eliminar el comando "${cmd.name}" (${cmd.id}): ${err.message}`);
        }
    }

    return toDelete.length;
}

/**
 * Carga todos los comandos de barra desde un directorio.
 * Devuelve la colección para el cliente y los payloads listos para registrar.
 */
function loadSlashCommands(commandsDirectory) {
    const commands = [];
    const guildCommands = new Map();
    const collection = new Collection();

    // Cualquier archivo nuevo en src/commands se cargará automáticamente.
    const commandFiles = fs.readdirSync(commandsDirectory).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsDirectory, file);
        const command = require(filePath);

        if (!command || !command.data || !command.execute) {
            console.warn(`[deploy] El archivo ${file} no exporta { data, execute }.`);
            continue;
        }

        const jsonData = command.data.toJSON();
        const allowedGuilds = Array.isArray(command.allowedGuilds)
            ? command.allowedGuilds.map(guildId => guildId && guildId.toString()).filter(Boolean)
            : [];

        if (allowedGuilds.length === 0) {
            commands.push(jsonData);
        } else {
            for (const guildId of allowedGuilds) {
                if (!guildCommands.has(guildId)) {
                    guildCommands.set(guildId, []);
                }
                guildCommands.get(guildId).push(jsonData);
            }
        }

        collection.set(jsonData.name, command);
    }

    return { commands, guildCommands, collection };
}

function filterCommandsForDebug(commands, debugMode, allowedCommands) {
    if (!debugMode) return commands;
    const allowed = allowedCommands || new Set();
    return commands.filter(cmd => allowed.has(cmd.name));
}

/**
 * Registra comandos de barra globales y por servidor.
 * Usa REST v14 y soporta despliegue rápido en un servidor específico además de global.
 */
async function registerSlashCommands({
    token,
    clientId,
    commands = [],
    guildCommands = new Map(),
    guildId = null,
    registerGlobally = true,
    debugMode = false,
    allowedCommands = new Set(),
    cleanupOrphaned = true,
}) {
    if (!token) throw new Error('No se recibió el token del bot');
    if (!clientId) throw new Error('No se recibió el client/application ID');

    const rest = new REST({ version: '10' }).setToken(token);
    const mainCommands = filterCommandsForDebug(commands, debugMode, allowedCommands);
    const scopedEntries = [...guildCommands.entries()].map(([id, cmds]) => [
        id,
        filterCommandsForDebug(cmds, debugMode, allowedCommands),
    ]);

    const totalScoped = scopedEntries.reduce((acc, [, cmds]) => acc + cmds.length, 0);
    const totalToRegister = mainCommands.length + totalScoped;
    const countText = debugMode ? `${totalToRegister} (modo debug activo)` : `${totalToRegister}`;
    console.log(`[deploy] Registrando ${countText} comandos...`);

    if (debugMode && totalToRegister === 0) {
        console.warn('[deploy] Modo debug activo pero no se encontraron comandos permitidos.');
    }

    const registerPayload = async (targetGuildId, payload) => {
        if (!payload.length) return null;
        const route = targetGuildId
            ? Routes.applicationGuildCommands(clientId, targetGuildId)
            : Routes.applicationCommands(clientId);
        const data = await rest.put(route, { body: payload });
        const scopeText = targetGuildId ? `en el servidor ${targetGuildId}` : 'globalmente';
        console.log(`[deploy] Comandos ${debugMode ? 'deshabilitados' : 'registrados'} ${scopeText} (${data.length}).`);
        return data;
    };

    // Registro rápido en un guild para pruebas.
    if (guildId) {
        await registerPayload(guildId, mainCommands);
    }

    // Registro global (puede tardar en propagarse, pero es el destino final).
    if (registerGlobally) {
        await registerPayload(null, mainCommands);
    }

    // Registro de comandos específicos por guild declarados en los archivos.
    for (const [targetGuildId, cmds] of scopedEntries) {
        if (!cmds.length) continue;
        await registerPayload(targetGuildId, cmds);
    }

    if (cleanupOrphaned) {
        const allowedGlobalNames = new Set(mainCommands.map(cmd => cmd.name));
        const guildAllowedMap = new Map();

        if (guildId) {
            guildAllowedMap.set(guildId, new Set(mainCommands.map(cmd => cmd.name)));
        }

        for (const [targetGuildId, cmds] of scopedEntries) {
            guildAllowedMap.set(targetGuildId, new Set(cmds.map(cmd => cmd.name)));
        }

        if (allowedGlobalNames.size > 0) {
            await cleanupOrphanCommands(rest, clientId, allowedGlobalNames, null);
        } else {
            console.warn('[deploy] Limpieza global omitida: no hay comandos permitidos para el ámbito global.');
        }

        for (const [targetGuildId, names] of guildAllowedMap.entries()) {
            if (names.size === 0) continue;
            await cleanupOrphanCommands(rest, clientId, names, targetGuildId);
        }
    }
}

module.exports = {
    loadSlashCommands,
    registerSlashCommands,
};
