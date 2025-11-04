const { Events, ActivityType } = require('discord.js');
const settings = require('../../config/settings.json');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`¡Bot listo! Conectado como ${client.user.tag}`);
        
        // Inicializar el administrador de sorteos
        const GiveawayManager = require('../features/GiveawayManager');
        client.giveawayManager = new GiveawayManager(client);

        // Función para actualizar el contador de usuarios
        function updateUserCount() {
            const guild = client.guilds.cache.get(settings.guildId);
            if (guild) {
                // Contar usuarios reales (no bots)
                const userCount = guild.members.cache.filter(member => !member.user.bot).size;
                client.user.setPresence({
                    activities: [{
                        name: `${userCount} usuarios`,
                        type: ActivityType.Watching
                    }],
                    status: 'online'
                });
            }
        }

        // Actualizar el contador inicialmente
        updateUserCount();

        // Actualizar el contador cada 5 minutos
        setInterval(updateUserCount, 5 * 60 * 1000);

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