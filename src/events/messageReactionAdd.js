const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Suggestion } = require('../models/Suggestion');

module.exports = {
    name: Events.MessageReactionAdd,
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
                        if (role) await member.roles.add(role);
                    }
                } catch (error) {
                    console.error('Error al procesar mapping de reactionrole:', error);
                }
            }
        }

        // Manejar reacciones en sugerencias para actualizar contador de aprobaciones
        try {
            const sugg = await Suggestion.findOne({ messageId: reaction.message.id }).exec();
            if (sugg) {
                const upReaction = reaction.message.reactions.cache.get('👍');
                let count = 0;
                if (upReaction) {
                    const users = await upReaction.users.fetch();
                    count = users.filter(u => !u.bot).size;
                }
                sugg.approvals = count;
                await sugg.save().catch(e => console.error('No se pudo guardar sugerencia en MongoDB', e));

                // actualizar embed
                const embed = reaction.message.embeds[0] ? reaction.message.embeds[0].toJSON() : null;
                if (embed) {
                    const fields = embed.fields || [];
                    const newFields = fields.map(f => f.name === 'Aprobaciones' ? { name: 'Aprobaciones', value: `${count}`, inline: f.inline } : f);
                    if (!newFields.some(f => f.name === 'Aprobaciones')) newFields.push({ name: 'Aprobaciones', value: `${count}`, inline: true });
                    const { EmbedBuilder } = require('discord.js');
                    const e = EmbedBuilder.from(embed);
                    e.data.fields = newFields;
                    await reaction.message.edit({ embeds: [e] }).catch(() => null);
                }
            }
        } catch (err) {
            console.error('Error actualizando aprobaciones de sugerencia:', err);
        }
    },
};