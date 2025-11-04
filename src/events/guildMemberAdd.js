const { Events, ActivityType } = require('discord.js');
const config = require('../../config/config.js');
const settings = require('../../config/settings.json');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Solo actualizar si es el servidor configurado
        if (member.guild.id === settings.guildId && !member.user.bot) {
            // Intentar fetch para tener conteo preciso
            try {
                const members = await member.guild.members.fetch();
                const userCount = members.filter(m => !m.user.bot).size;
                member.client.user.setPresence({
                    activities: [{
                        name: `${userCount} usuarios`,
                        type: ActivityType.Watching
                    }],
                    status: 'online'
                });
            } catch (e) {
                // Fallback a cache
                const userCount = member.guild.members.cache.filter(m => !m.user.bot).size;
                member.client.user.setPresence({
                    activities: [{
                        name: `${userCount} usuarios`,
                        type: ActivityType.Watching
                    }],
                    status: 'online'
                });
            }
        }
        if (config.autoroles.enabled && config.autoroles.roles.length > 0) {
            try {
                const roles = config.autoroles.roles
                    .map(roleId => member.guild.roles.cache.get(roleId))
                    .filter(role => role != null);

                if (roles.length > 0) {
                    await member.roles.add(roles);
                }
            } catch (error) {
                console.error('Error al asignar autoroles:', error);
            }
        }
    },
};