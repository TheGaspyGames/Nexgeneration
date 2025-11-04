const { Events } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
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