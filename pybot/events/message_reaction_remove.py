from __future__ import annotations

import discord
from discord.ext import commands

from ..database import is_mongo_connected, suggestions_repository
from .message_reaction_add import update_suggestion_reactions


class MessageReactionRemoveEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_reaction_remove(self, reaction: discord.Reaction, user: discord.User) -> None:
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

        await update_suggestion_reactions(reaction.message, record)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MessageReactionRemoveEvents(bot))
