from __future__ import annotations

import discord
from discord.ext import commands

from ..database import is_mongo_connected, suggestions_repository


class MessageReactionAddEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_reaction_add(self, reaction: discord.Reaction, user: discord.User) -> None:
        if user.bot:
            return
        if reaction.message.partial:
            try:
                await reaction.message.fetch()
            except Exception:
                return

        if not await is_mongo_connected():
            return

        record = await suggestions_repository.get_suggestion_by_message(reaction.message.id)
        if not record:
            return

        is_upvote = str(reaction.emoji) == "👍" or getattr(reaction.emoji, "name", None) == "👍"
        if is_upvote and record.author_id == str(user.id):
            try:
                await reaction.remove(user)
            except Exception:
                pass
            return

        await update_suggestion_reactions(reaction.message, record)


async def update_suggestion_reactions(message: discord.Message, record) -> None:
    up_reaction = discord.utils.get(message.reactions, emoji="👍")
    down_reaction = discord.utils.get(message.reactions, emoji="👎")
    upvotes = 0
    downvotes = 0
    if up_reaction:
        try:
            users = await up_reaction.users().flatten()
            upvotes = len([u for u in users if not u.bot and str(u.id) != str(record.author_id)])
        except Exception:
            upvotes = max(0, (up_reaction.count or 0) - 1)
    if down_reaction:
        try:
            users = await down_reaction.users().flatten()
            downvotes = len([u for u in users if not u.bot])
        except Exception:
            downvotes = max(0, (down_reaction.count or 0) - 1)

    await suggestions_repository.update_approvals(record.id, upvotes)

    if not message.embeds:
        return
    embed_dict = message.embeds[0].to_dict()
    fields = []
    for field in embed_dict.get("fields", []):
        name = field.get("name")
        if name == "Votos":
            field["value"] = f"👍 {upvotes} | 👎 {downvotes}"
        fields.append(field)
    embed_dict["fields"] = fields
    colour = config_colour_for_status(record.status)
    embed_dict["color"] = colour.value
    updated = discord.Embed.from_dict(embed_dict)
    if record.author_avatar:
        updated.set_thumbnail(url=record.author_avatar)
    try:
        await message.edit(embed=updated)
    except Exception:
        pass


def config_colour_for_status(status: str) -> discord.Colour:
    status = (status or "").lower()
    if status in {"aprobada", "implementada"}:
        return discord.Colour(0x2ECC71)
    if status == "denegada":
        return discord.Colour(0xE74C3C)
    return discord.Colour(0x3498DB)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MessageReactionAddEvents(bot))
