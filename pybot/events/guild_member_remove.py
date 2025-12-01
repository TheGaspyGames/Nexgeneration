from __future__ import annotations

from discord.ext import commands

from .. import config


class GuildMemberRemoveEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_remove(self, member):
        settings = config.resolve_config()
        if not settings.get("guildId"):
            return
        if str(member.guild.id) != str(settings.get("guildId")):
            return
        if member.bot:
            return
        await self.bot.update_presence_count(delta=-1)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(GuildMemberRemoveEvents(bot))
