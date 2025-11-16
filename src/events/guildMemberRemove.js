const { Events } = require('discord.js');
const settings = require('../../config/settings.json');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        // Solo actualizar si es el servidor configurado
        if (member.guild.id !== settings.guildId) return;

        // Solo actualizar si el miembro que salió no era un bot
        if (member.user.bot) return;

        member.client.updatePresenceCount({ delta: -1 }).catch(() => {});
    },
};