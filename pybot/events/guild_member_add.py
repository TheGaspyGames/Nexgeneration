from __future__ import annotations

from discord.ext import commands

from .. import config


class GuildMemberAddEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member):
        settings = config.resolve_config()
        if member.guild and settings.get("guildId") and str(member.guild.id) == str(settings.get("guildId")):
            if not member.bot:
                await self.bot.update_presence_count(delta=1)

        autoroles = settings.get("autoroles", {})
        if autoroles.get("enabled") and autoroles.get("roles"):
            try:
                roles = [member.guild.get_role(int(role_id)) for role_id in autoroles.get("roles", [])]
                roles = [role for role in roles if role]
                if roles:
                    await member.add_roles(*roles)
            except Exception:
                pass


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(GuildMemberAddEvents(bot))
