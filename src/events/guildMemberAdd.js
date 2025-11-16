const { Events } = require('discord.js');
const config = require('../../config/config.js');
const settings = require('../../config/settings.json');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Solo actualizar si es el servidor configurado
        if (member.guild.id === settings.guildId && !member.user.bot) {
            member.client.updatePresenceCount({ delta: 1 }).catch(() => {});
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