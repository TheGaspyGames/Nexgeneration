'use strict';

const fs = require('fs');
const path = require('path');
const { Collection, REST, Routes } = require('discord.js');

/**
 * Recorre un directorio de forma recursiva y devuelve todos los archivos .js encontrados.
 */
function getCommandFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getCommandFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

async function cleanupOrphanCommands(rest, clientId, allowedNames, targetGuildId = null, deleteAllWhenEmpty = false) {
    if (!allowedNames || allowedNames.size === 0) {
        if (!deleteAllWhenEmpty) return 0;
    }

    const listRoute = targetGuildId
        ? Routes.applicationGuildCommands(clientId, targetGuildId)
        : Routes.applicationCommands(clientId);
    const deleteRoute = (commandId) => targetGuildId
        ? Routes.applicationGuildCommand(clientId, targetGuildId, commandId)
        : Routes.applicationCommand(clientId, commandId);

    const existing = await rest.get(listRoute);
    const toDelete = allowedNames.size === 0
        ? existing
        : existing.filter(cmd => !allowedNames.has(cmd.name));
    if (!toDelete.length) return 0;

    for (const cmd of toDelete) {
        try {
            await rest.delete(deleteRoute(cmd.id));
            const scopeText = targetGuildId ? `guild ${targetGuildId}` : 'global';
            console.log(`[deploy] Eliminado comando huerfano "${cmd.name}" (${cmd.id}) en ${scopeText}.`);
        } catch (err) {
            console.warn(`[deploy] No se pudo eliminar el comando "${cmd.name}" (${cmd.id}): ${err.message}`);
        }
    }

    return toDelete.length;
}

/**
 * Carga todos los comandos de barra desde un directorio (y subdirectorios).
 * Devuelve la coleccion para el cliente y los payloads listos para registrar.
 *
 * Reglas de alcance (por prioridad):
 *   1. command.allowedGuilds = ['guildId']  → solo ese servidor
 *   2. command.globalCommand = false         → NO se registra globalmente (solo guild principal)
 *   3. Sin ninguna propiedad                 → global
 */
function loadSlashCommands(commandsDirectory) {
    const commands = [];       // comandos globales
    const guildCommands = new Map(); // comandos por guild específico
    const collection = new Collection();

    const commandFiles = getCommandFiles(commandsDirectory);

    for (const filePath of commandFiles) {
        let command;
        try {
            command = require(filePath);
        } catch (err) {
            console.warn(`[deploy] Error cargando ${filePath}: ${err.message}`);
            continue;
        }

        if (!command || !command.data || !command.execute) {
            console.warn(`[deploy] El archivo ${path.basename(filePath)} no exporta { data, execute }.`);
            continue;
        }

        const jsonData = command.data.toJSON();

        // allowedGuilds: array de IDs de guilds donde el comando es exclusivo
        const allowedGuilds = Array.isArray(command.allowedGuilds)
            ? command.allowedGuilds.map(id => id && id.toString()).filter(Boolean)
            : [];

        if (allowedGuilds.length > 0) {
            // Comando exclusivo de uno o más servidores específicos
            for (const guildId of allowedGuilds) {
                if (!guildCommands.has(guildId)) guildCommands.set(guildId, []);
                guildCommands.get(guildId).push(jsonData);
            }
        } else {
            // Comando global
            commands.push(jsonData);
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
    cleanupGuilds = [],
}) {
    if (!token) throw new Error('No se recibio el token del bot');
    if (!clientId) throw new Error('No se recibio el client/application ID');

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
        console.log(`[deploy] Comandos ${debugMode ? 'filtrados (debug)' : 'registrados'} ${scopeText} (${data.length}).`);
        return data;
    };

    if (guildId) await registerPayload(guildId, mainCommands);
    if (registerGlobally) await registerPayload(null, mainCommands);

    for (const [targetGuildId, cmds] of scopedEntries) {
        if (!cmds.length) continue;
        await registerPayload(targetGuildId, cmds);
    }

    if (cleanupOrphaned) {
        const allowedGlobalNames = new Set(mainCommands.map(cmd => cmd.name));
        const guildAllowedMap = new Map();
        const guildDeleteAll = new Set();

        if (guildId) guildAllowedMap.set(guildId, new Set(mainCommands.map(cmd => cmd.name)));

        for (const [targetGuildId, cmds] of scopedEntries) {
            guildAllowedMap.set(targetGuildId, new Set(cmds.map(cmd => cmd.name)));
        }

        for (const guildToClean of cleanupGuilds) {
            const normalized = guildToClean && guildToClean.toString();
            if (!normalized) continue;
            if (!guildAllowedMap.has(normalized)) {
                guildAllowedMap.set(normalized, new Set());
                guildDeleteAll.add(normalized);
            }
        }

        if (allowedGlobalNames.size > 0) {
            await cleanupOrphanCommands(rest, clientId, allowedGlobalNames, null);
        } else {
            console.warn('[deploy] Limpieza global omitida: no hay comandos globales definidos.');
        }

        for (const [targetGuildId, names] of guildAllowedMap.entries()) {
            const deleteAll = guildDeleteAll.has(targetGuildId);
            await cleanupOrphanCommands(rest, clientId, names, targetGuildId, deleteAll);
        }
    }
}

module.exports = { loadSlashCommands, registerSlashCommands };
