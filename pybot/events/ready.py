from __future__ import annotations

import logging

from discord.ext import commands, tasks

PRESENCE_RESYNC_INTERVAL_MINUTES = 30


class ReadyEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.presence_resync.start()

    def cog_unload(self) -> None:
        self.presence_resync.cancel()

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        if not self.bot.user:
            return
        logging.info("¡Bot listo! Conectado como %s", self.bot.user)
        await self.bot.queue_startup_log(
            "Estado", "Bot conectado", f"¡Bot listo! Conectado como {self.bot.user}"
        )
        await self.bot.update_presence_count(force=True)
        await self.bot.notify_debug_mode()

    @tasks.loop(minutes=PRESENCE_RESYNC_INTERVAL_MINUTES)
    async def presence_resync(self) -> None:
        await self.bot.update_presence_count(force=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ReadyEvents(bot))
