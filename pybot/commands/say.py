import discord
from discord import app_commands
from discord.ext import commands


class Say(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="decir", description="El bot enviará un mensaje con el texto proporcionado.")
    async def say(self, interaction: discord.Interaction, mensaje: str) -> None:
        await interaction.response.send_message("✅ Mensaje enviado.", ephemeral=True)
        await interaction.channel.send(mensaje)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Say(bot))
