module.exports = {
    embedColor: '#FF5733', // Color principal para los embeds
    giveawayEmoji: '🎉', // Emoji para los sorteos
    // Por defecto, suggestionsChannel se leerá desde settings.json (persistente)
    suggestionsChannel: 'ID_DEL_CANAL_DE_SUGERENCIAS', // Valor por defecto
    // Logging: canal y servidor donde el bot enviará logs internos
    logs: {
        guildId: '1433154337227542792', // servidor donde van los logs
        channelId: '1435121677649449120' // canal donde van los logs
    },
    autoModeration: {
        enabled: true,
        aiFlagging: false, // si true, se ejecuta un análisis (placeholder) y solo marca, no sanciona
        maxMentions: 5, // Número máximo de menciones permitidas
        maxLines: 10, // Número máximo de líneas permitidas
        bannedWords: [] // Palabras prohibidas
    },
    autoroles: {
        enabled: true,
        roles: [] // IDs de roles que se darán automáticamente
    }
};