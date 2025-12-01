from __future__ import annotations

import time
import time
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from .. import config
from ..database import is_mongo_connected, suggestions_repository


class Suggestions(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def _suggestions_channel(self, guild: discord.Guild) -> Optional[discord.TextChannel]:
        settings = config.load_settings()
        channel_id = settings.get("suggestionsChannel") or config.DEFAULT_CONFIG.get("suggestionsChannel")
        if not channel_id:
            return None
        channel = guild.get_channel(int(channel_id))
        return channel if isinstance(channel, discord.TextChannel) else None

    @app_commands.command(name="setsugch", description="Configura el canal de sugerencias")
    @app_commands.describe(canal="El canal donde se publicarán las sugerencias")
    @app_commands.default_permissions(administrator=True)
    async def set_suggestions_channel(self, interaction: discord.Interaction, canal: discord.TextChannel) -> None:
        config.set_setting("suggestionsChannel", str(canal.id))
        await interaction.response.send_message(
            f"✅ Canal de sugerencias configurado en {canal.mention}.", ephemeral=True
        )

    @app_commands.command(name="sugerir", description="Envía una sugerencia para el servidor")
    @app_commands.describe(sugerencia="Tu sugerencia para el servidor")
    async def suggest(self, interaction: discord.Interaction, sugerencia: str) -> None:
        channel = await self._suggestions_channel(interaction.guild)
        if channel is None:
            await interaction.response.send_message(
                "❌ El canal de sugerencias no está configurado. Un administrador debe ejecutar `/setsugch` para configurarlo.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)

        suggestion_id: Optional[int] = None
        if await is_mongo_connected():
            suggestion_id = await suggestions_repository.get_next_sequence("suggestionId")
        if suggestion_id is None:
            suggestion_id = int(time.time() * 1000)

        embed = discord.Embed(
            title="⭐ ¡Nueva sugerencia! ⭐",
            colour=discord.Colour.from_str(config.DEFAULT_CONFIG["embedColor"]),
            timestamp=discord.utils.utcnow(),
        )
        embed.add_field(name="ID sug:", value=str(suggestion_id), inline=True)
        embed.add_field(name="Fecha:", value=f"<t:{int(time.time())}:R>", inline=True)
        embed.add_field(name="Autor:", value=interaction.user.mention, inline=True)
        embed.add_field(name="\u200B", value="\u200B")
        embed.add_field(name="Sug:", value=sugerencia)
        embed.add_field(name="\u200B", value="\u200B")
        embed.add_field(name="Estado", value="⏳ Pendiente", inline=True)
        embed.add_field(name="Votos", value="👍 0 | 👎 1", inline=True)
        embed.set_thumbnail(url=interaction.user.display_avatar.url)

        message = await channel.send(embed=embed)
        try:
            await message.add_reaction("👍")
            await message.add_reaction("👎")
        except discord.HTTPException:
            pass

        saved_in_db = False
        if await is_mongo_connected():
            saved_in_db = await suggestions_repository.save_suggestion(
                {
                    "id": suggestion_id,
                    "authorId": str(interaction.user.id),
                    "authorTag": str(interaction.user),
                    "authorAvatar": interaction.user.display_avatar.url,
                    "messageId": message.id,
                    "channelId": message.channel.id,
                    "content": sugerencia,
                    "scope": "public",
                    "status": "Pendiente",
                    "approvals": 0,
                    "createdAt": discord.utils.utcnow(),
                    "updatedAt": discord.utils.utcnow(),
                }
            )

        reply = f"✅ Tu sugerencia ha sido enviada al canal {channel.mention}."
        if not saved_in_db:
            reply += "\n⚠️ No se pudo guardar en la base de datos, pero la sugerencia seguirá visible en el canal."
        await interaction.followup.send(reply, ephemeral=True)

    @app_commands.command(name="sugerencia", description="Acciones de moderación sobre una sugerencia")
    @app_commands.describe(id="ID de la sugerencia", accion="Acción a realizar")
    @app_commands.choices(
        accion=[
            app_commands.Choice(name="aprobar", value="aprobar"),
            app_commands.Choice(name="implementada", value="implementada"),
        ]
    )
    @app_commands.default_permissions(administrator=True)
    async def handle_suggestion(
        self, interaction: discord.Interaction, id: int, accion: app_commands.Choice[str]
    ) -> None:
        if not await is_mongo_connected():
            await interaction.response.send_message(
                "⚠️ La base de datos no está disponible actualmente. Inténtalo más tarde.", ephemeral=True
            )
            return

        record = await suggestions_repository.get_suggestion(id)
        if not record:
            await interaction.response.send_message(
                f"No se encontró la sugerencia con ID {id}.", ephemeral=True
            )
            return

        channel = interaction.guild.get_channel(int(record.channel_id)) if interaction.guild else None
        if channel is None:
            await interaction.response.send_message("No se encontró el canal de la sugerencia.", ephemeral=True)
            return

        try:
            message = await channel.fetch_message(int(record.message_id))
        except (discord.NotFound, discord.HTTPException):
            await interaction.response.send_message("No se encontró el mensaje de la sugerencia.", ephemeral=True)
            return

        embed = message.embeds[0] if message.embeds else discord.Embed()
        if accion.value == "aprobar":
            status_value = "✅ Aprobada"
        else:
            status_value = "🚀 Implementada"
        embed_dict = embed.to_dict()
        fields = []
        upvotes = next((reaction.count - 1 for reaction in message.reactions if str(reaction.emoji) == "👍"), 0)
        downvotes = next((reaction.count - 1 for reaction in message.reactions if str(reaction.emoji) == "👎"), 0)

        for field in embed_dict.get("fields", []):
            name = field.get("name")
            if name == "Estado":
                field["value"] = status_value
            elif name == "Votos":
                field["value"] = f"👍 {upvotes} | 👎 {downvotes}"
            fields.append(field)

        embed_dict["fields"] = fields
        embed_dict["color"] = discord.Colour.from_str(config.DEFAULT_CONFIG["embedColor"]).value
        updated_embed = discord.Embed.from_dict(embed_dict)
        if record.author_avatar:
            updated_embed.set_thumbnail(url=record.author_avatar)

        await message.edit(embed=updated_embed)
        await suggestions_repository.update_suggestion(record.id, {"status": status_value.replace("✅ ", "")})
        await interaction.response.send_message(
            f"✅ Sugerencia {record.id} actualizada: {status_value}", ephemeral=True
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Suggestions(bot))
