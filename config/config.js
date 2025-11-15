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
        maxMentions: 5, // Número máximo de menciones permitidas
        maxLines: 10000000000, // Número máximo de líneas permitidas
        bannedWords: [], // Palabras prohibidas
        ignoredRoles: [], // Roles exentos del automod
        ignoredUsers: [], // Usuarios exentos del automod
        reportChannelId: '1439349036644569359', // Canal donde se notifican los bloqueos por palabras prohibidas
        reviewChannelId: '1439361552598696147' // Canal donde se envían reportes con botones para revisar insultos
    },
    autoroles: {
        enabled: true,
        roles: [] // IDs de roles que se darán automáticamente
    }
};
