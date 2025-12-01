import time

import discord
from discord import app_commands
from discord.ext import commands


class Ping(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="ping", description="Muestra la latencia actual del bot y la API de Discord.")
    async def ping(self, interaction: discord.Interaction) -> None:
        start_time = time.perf_counter()
        await interaction.response.defer(thinking=True)
        elapsed_ms = round((time.perf_counter() - start_time) * 1000)
        api_latency = round(self.bot.latency * 1000)

        await interaction.followup.send(
            content=(
                "🏓 Pong!\n"
                f"Latencia del bot: **{elapsed_ms}ms**\n"
                f"Latencia de la API: **{api_latency}ms**"
            )
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Ping(bot))
