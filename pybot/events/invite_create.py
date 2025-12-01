from __future__ import annotations

from discord.ext import commands


class InviteCreateEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_invite_create(self, invite):
        if hasattr(self.bot, "invalidate_invite_cache"):
            guild_id = getattr(invite.guild, "id", None)
            self.bot.invalidate_invite_cache(guild_id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(InviteCreateEvents(bot))
