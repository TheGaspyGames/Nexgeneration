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
                // Si la reacción añadida es la de aprobación y quien reaccionó es el autor de la sugerencia,
                // remover la reacción y no contar ese voto.
                const isUpvote = (reaction.emoji && (reaction.emoji.name === '👍' || reaction.emoji.toString() === '👍'));
                if (isUpvote && sugg.authorId === user.id) {
                    try {
                        // Intentar remover la reacción del autor. Requiere permiso para MANAGE_MESSAGES en el canal.
                        await reaction.users.remove(user.id).catch(() => {});
                    } catch (remErr) {
                        // No interrumpir el flujo si no se pudo remover la reacción.
                        console.error('No se pudo remover la reacción del autor de la sugerencia:', remErr.message || remErr);
                    }
                    // No contamos ni actualizamos nada puesto que la reacción del autor fue ignorada/quitada.
                    return;
                }

                const upReaction = reaction.message.reactions.cache.get('👍');
                let count = 0;
                if (upReaction) {
                    const users = await upReaction.users.fetch();
                    count = users.filter(u => !u.bot && u.id !== sugg.authorId).size;
                }
                sugg.approvals = count;
                await sugg.save().catch(e => console.error('No se pudo guardar sugerencia en MongoDB', e));

                // actualizar embed (preservar color/imagen basados en el estado guardado)
                const embed = reaction.message.embeds[0] ? reaction.message.embeds[0].toJSON() : null;
                if (embed) {
                    const { EmbedBuilder } = require('discord.js');
                    const e = EmbedBuilder.from(embed);

                    // Actualizar votos
                    const upvotes = reaction.message.reactions.cache.get('👍')?.count || 0;
                    const downvotes = reaction.message.reactions.cache.get('👎')?.count || 0;

                    // Actualizar campos preservando el formato
                    e.data.fields = embed.fields.map(f => {
                        if (f.name === 'Votos') {
                            return {
                                name: 'Votos',
                                value: `👍 ${upvotes - 1} | 👎 ${downvotes - 1}`,
                                inline: true
                            };
                        }
                        return f;
                    });

                    // Determinar color por estado
                    try {
                        if (sugg.status === 'Aprobada' || sugg.status === 'Implementada') e.setColor('#2ECC71');
                        else if (sugg.status === 'Denegada') e.setColor('#E74C3C');
                        else e.setColor('#3498db');
                    } catch (ce) { /* ignore */ }

                    // Asegurar thumbnail del autor
                    if (sugg.authorAvatar) {
                        try { e.setThumbnail(sugg.authorAvatar); } catch (ie) { /* ignore */ }
                    }

                    await reaction.message.edit({ embeds: [e] }).catch(() => null);
                }
            }
        } catch (err) {
            console.error('Error actualizando aprobaciones de sugerencia:', err);
        }
    },
};