const { Events } = require('discord.js');

const PRESENCE_RESYNC_INTERVAL_MS = 30 * 60 * 1000;

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`¡Bot listo! Conectado como ${client.user.tag}`);
        client.queueStartupLog('Estado', 'Bot conectado', `¡Bot listo! Conectado como ${client.user.tag}`);

        // Inicializar el administrador de sorteos
        const GiveawayManager = require('../features/GiveawayManager');
        client.giveawayManager = new GiveawayManager(client);

        const resyncPresence = () => {
            client.updatePresenceCount({ force: true }).catch(() => {});
        };

        resyncPresence();
        client.presenceResyncInterval = setInterval(resyncPresence, PRESENCE_RESYNC_INTERVAL_MS);
        if (client.presenceResyncInterval.unref) {
            client.presenceResyncInterval.unref();
        }

        // Restaurar temporizadores de sorteos activos
        if (client.giveaways && client.giveaways.size > 0) {
            for (const [messageId, giveaway] of client.giveaways) {
                if (!giveaway.ended && giveaway.endTime > Date.now()) {
                    client.giveawayManager.setTimer(messageId);
                }
            }
        }
    },
};