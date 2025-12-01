from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Optional

import aiohttp
import discord
from discord.ext import commands
from ..utils.automod_cache import automod_cache

IP_TRIGGER_SET = {
    "ip",
    "ip del server",
    "ip del servidor",
    "ip server",
    "ip servidor",
    "cual es la ip",
    "cual es la ip del server",
    "cual es la ip del servidor",
    "cual es la ip server",
}
IP_RESPONSE_COOLDOWN_MS = 5 * 60 * 1000


class MessageCreateEvents(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.ip_response_cooldowns: dict[str, float] = {}

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        if getattr(self.bot, "giveaway_manager", None):
            prev = self.bot.giveaway_manager.message_count.get(message.author.id, 0)
            self.bot.giveaway_manager.message_count[message.author.id] = prev + 1

        raw_content = message.content or ""
        lowered = raw_content.lower()

        if "ip" in lowered:
            normalized = normalize_content_for_ip(raw_content)
            if normalized and normalized in IP_TRIGGER_SET:
                now = time.time() * 1000
                key = f"guild:{message.guild.id}" if message.guild else f"user:{message.author.id}"
                last_trigger = self.ip_response_cooldowns.get(key)
                if not last_trigger or (now - last_trigger) >= IP_RESPONSE_COOLDOWN_MS:
                    self.ip_response_cooldowns[key] = now
                    response = "\n".join(
                        [
                            f"Hola {message.author} la ip es la siguiente",
                            "Java: `nexgneration.sdlf.fun`",
                            "Bedrock: `nexgneration.sdlf.fun` o `ns570401.seedloaf.com`",
                            "Puerto: `49376`",
                            "",
                            "Las versiones disponibles son de la 1.12 en adelante!",
                            "",
                            "Pásala bien en el server!<:gato_mirada:1192169587932934344>",
                        ]
                    )
                    await message.reply(content=response)
                    return

        cfg = self.bot.config.get("autoModeration", {})
        if not cfg.get("enabled", False):
            return

        if str(message.author.id) in map(str, cfg.get("ignoredUsers", [])):
            return

        if message.guild and message.author:
            member = message.guild.get_member(message.author.id)
            if member and any(str(role.id) in map(str, cfg.get("ignoredRoles", [])) for role in member.roles):
                return

        if cfg.get("aiFlagging"):
            self.bot.run_in_background(lambda: analyze_message_for_flagging(raw_content, self.bot, message))

        mentions = len(message.mentions or []) + len(message.role_mentions or [])
        if mentions > cfg.get("maxMentions", 0):
            await message.delete()
            warn = await message.channel.send(
                content=f"⚠️ {message.author}, no se permiten más de {cfg.get('maxMentions', 0)} menciones por mensaje."
            )
            asyncio.create_task(warn.delete(delay=5))
            return

        matched = list({word.lower() for word in automod_cache.get_matches(lowered)})
        if matched:
            await message.delete()
            warn = await message.channel.send(content=f"⚠️ {message.author}, tu mensaje contiene palabras prohibidas.")
            asyncio.create_task(warn.delete(delay=5))

            highlighted = automod_cache.highlight(raw_content)
            display_name = message.author.display_name if hasattr(message.author, "display_name") else str(message.author)
            report_channel_id = cfg.get("reportChannelId")
            review_channel_id = cfg.get("reviewChannelId")

            if report_channel_id:
                try:
                    report_channel = await self.bot.resolve_channel(report_channel_id)
                    if isinstance(report_channel, discord.TextChannel):
                        await report_channel.send(
                            embeds=[create_automod_embed(message, display_name, highlighted)]
                        )
                except Exception:
                    pass

            if review_channel_id:
                try:
                    review_channel = await self.bot.resolve_channel(review_channel_id)
                    if isinstance(review_channel, discord.TextChannel):
                        review_id = f"{int(time.time()*1000)}-{os.urandom(4).hex()}"
                        self.bot.auto_mod_review_actions[review_id] = {"words": matched}
                        asyncio.create_task(self._cleanup_review(review_id))
                        view = discord.ui.View()
                        view.add_item(
                            discord.ui.Button(
                                custom_id=f"automod-review:good:{review_id}",
                                label="Buen insulto",
                                style=discord.ButtonStyle.success,
                            )
                        )
                        view.add_item(
                            discord.ui.Button(
                                custom_id=f"automod-review:bad:{review_id}",
                                label="Mal insulto",
                                style=discord.ButtonStyle.danger,
                            )
                        )
                        await review_channel.send(
                            embeds=[create_automod_embed(message, display_name, highlighted)], view=view
                        )
                except Exception:
                    pass
            return

        lines = raw_content.split("\n")
        if len(lines) > cfg.get("maxLines", 0):
            await message.delete()
            warn = await message.channel.send(
                content=f"⚠️ {message.author}, tu mensaje contiene demasiadas líneas. Máximo permitido: {cfg.get('maxLines', 0)}"
            )
            asyncio.create_task(warn.delete(delay=5))

    async def _cleanup_review(self, review_id: str) -> None:
        await asyncio.sleep(24 * 60 * 60)
        self.bot.auto_mod_review_actions.pop(review_id, None)


def create_automod_embed(message: discord.Message, display_name: str, highlighted: str) -> discord.Embed:
    embed = discord.Embed(title="Automod", colour=discord.Colour.red())
    embed.add_field(name="Usuario", value=f"{message.author.id} - {display_name}", inline=False)
    embed.add_field(
        name="Lo que dijo", value=(highlighted[:1024] if highlighted else "*Sin contenido*"), inline=False
    )
    if message.guild:
        embed.set_footer(text=f"Servidor: {message.guild.name} | Canal: #{getattr(message.channel, 'name', message.channel.id)}")
    embed.timestamp = discord.utils.utcnow()
    return embed


async def analyze_message_for_flagging(content: str, bot: commands.Bot, message: discord.Message) -> None:
    if not content:
        return
    lowered = content.lower()
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    flagged = False
    detail: Optional[str | dict] = None
    if api_key:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.openai.com/v1/moderations",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    data=json.dumps({"model": "omni-moderation-latest", "input": content}),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    data = await resp.json()
                    result = data.get("results", [{}])[0]
                    if result.get("flagged"):
                        flagged = True
                        detail = result
        except Exception:
            pass

    insults_en = [
        "idiot",
        "stupid",
        "dumb",
        "loser",
        "shut up",
        "bastard",
        "asshole",
        "fuck you",
        "suck",
        "retard",
        "trash",
    ]
    insults_es = [
        "idiota",
        "estúpido",
        "estupido",
        "imbécil",
        "imbecil",
        "gilipollas",
        "tonto",
        "cabrón",
        "cabron",
        "puta",
        "mierda",
        "hijo de puta",
        "culero",
        "pendejo",
        "tarado",
    ]
    if any(word in lowered for word in insults_en + insults_es):
        flagged = True
        detail = detail or "keywords"

    mention_count = len(message.mentions or [])
    if mention_count >= 5:
        flagged = True
        detail = detail or f"mentions:{mention_count}"

    if flagged:
        mod_channel_id = getattr(bot, "settings", {}).get("modLogChannel")
        embed_desc = (
            f"Usuario: {message.author} ({message.author.id})\n"
            f"Guild: {message.guild.name if message.guild else 'DM'}\nCanal: {message.channel.id}\n\n"
            f"Contenido:\n{content[:1900]}\n\nDetalle: {detail if isinstance(detail, str) else json.dumps(detail)[:1900]}"
        )
        if mod_channel_id:
            try:
                channel = await bot.resolve_channel(mod_channel_id)
                if isinstance(channel, discord.TextChannel):
                    embed = discord.Embed(
                        title="AutoMod - Mensaje marcado por IA", description=embed_desc, colour=discord.Colour.red()
                    )
                    embed.timestamp = discord.utils.utcnow()
                    await channel.send(embed=embed)
                    return
            except Exception:
                pass
        await bot.log("AutoMod - AI Flag", "Mensaje marcado", embed_desc, {"id": message.author.id, "tag": str(message.author)})


def normalize_content_for_ip(content: str) -> str:
    normalized = (
        content.lower()
        .replace("¿", "")
        .replace("?", "")
        .replace("¡", "")
        .replace("!", "")
        .replace(",", "")
        .replace(".", "")
        .replace(";", "")
        .replace(":", "")
    )
    normalized = " ".join(normalized.split())
    return normalized


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MessageCreateEvents(bot))
