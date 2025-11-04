const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`¡Bot listo! Conectado como ${client.user.tag}`);
        
        // Inicializar el administrador de sorteos
        const GiveawayManager = require('../features/GiveawayManager');
        client.giveawayManager = new GiveawayManager(client);

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