const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        // Ignorar reacciones de bots
        if (user.bot) return;

        // Asegurarse de que la reacción esté completamente cargada
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Error al cargar la reacción:', error);
                return;
            }
        }

        // Manejar roles por reacción (múltiples mappings)
        if (reaction.client.reactionRoles && reaction.client.reactionRoles.has(reaction.message.id)) {
            const cfg = reaction.client.reactionRoles.get(reaction.message.id);
            const mappings = cfg.mappings || [];
            for (const mapping of mappings) {
                try {
                    if (reaction.emoji.toString() === mapping.emoji) {
                        const guild = reaction.message.guild;
                        const member = await guild.members.fetch(user.id);
                        const role = guild.roles.cache.get(mapping.roleId);
                        if (role) await member.roles.remove(role);
                    }
                } catch (error) {
                    console.error('Error al procesar mapping de reactionrole:', error);
                }
            }
        }
    },
};