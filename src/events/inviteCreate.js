const { Events } = require('discord.js');

module.exports = {
    name: Events.InviteCreate,
    async execute(invite) {
        if (!invite?.client?.invalidateInviteCache) return;
        const guildId = invite.guild?.id;
        invite.client.invalidateInviteCache(guildId);
    },
};
