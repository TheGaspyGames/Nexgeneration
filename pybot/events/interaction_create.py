from __future__ import annotations

import discord
from discord.ext import commands

from ..utils.automod_cache import automod_cache


class InteractionCreateEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_interaction(self, interaction: discord.Interaction) -> None:
        if interaction.type != discord.InteractionType.component:
            return

        custom_id = interaction.data.get("custom_id") if interaction.data else ""
        if not custom_id:
            return

        if custom_id.startswith("automod-review:"):
            await self.handle_automod_review(interaction, custom_id)
            return

        if custom_id == "giveaway-join":
            await self.bot.giveaway_manager.handle_join(interaction)
        elif custom_id == "giveaway-participants":
            await self.bot.giveaway_manager.handle_participants(interaction)
        elif custom_id.startswith("giveaway-leave:"):
            await self.bot.giveaway_manager.handle_leave(interaction)

    async def handle_automod_review(self, interaction: discord.Interaction, custom_id: str) -> None:
        parts = custom_id.split(":")
        if len(parts) < 3:
            await self._reply(interaction, "⚠️ No se pudo procesar esta acción.")
            return

        action = parts[1]
        review_id = parts[2]
        store = self.bot.auto_mod_review_actions.get(review_id)
        if not store:
            await self._reply(interaction, "⚠️ Esta revisión ya no está disponible.")
            return

        if action == "good":
            await self._reply(interaction, "✅ Marcado como buen insulto. No se realizaron cambios.")
            return

        if action == "bad":
            removed = remove_banned_words(store.get("words", []), self.bot)
            self.bot.auto_mod_review_actions.pop(review_id, None)
            if removed > 0:
                await self._reply(interaction, f"✅ Se eliminaron {removed} palabra(s) de la lista prohibida.")
                try:
                    if interaction.message:
                        await interaction.message.edit(view=None)
                except Exception:
                    pass
            else:
                await self._reply(interaction, "⚠️ No se encontraron esas palabras en la lista prohibida.")
            return

        await self._reply(interaction, "⚠️ Acción no reconocida.")

    async def _reply(self, interaction: discord.Interaction, content: str) -> None:
        payload = {"content": content, "ephemeral": True}
        if interaction.response.is_done():
            await interaction.followup.send(**payload)
        else:
            await interaction.response.send_message(**payload)


def remove_banned_words(words, bot: commands.Bot) -> int:
    if not words:
        return 0
    cfg = bot.config.setdefault("autoModeration", {})
    banned_list = cfg.setdefault("bannedWords", [])
    normalized = {str(word).lower() for word in words if word}
    original_len = len(banned_list)
    banned_list[:] = [w for w in banned_list if str(w).lower() not in normalized]
    removed = original_len - len(banned_list)
    if removed:
        automod_cache.invalidate()
    return removed


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(InteractionCreateEvents(bot))
