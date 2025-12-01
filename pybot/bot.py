from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from typing import Iterable, Optional

import discord
from discord.ext import commands
from dotenv import load_dotenv

if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from pybot.config import DEBUG_STATE_FILE, resolve_config
from pybot.features.giveaways import GiveawayManager
from pybot.utils.performance import BackgroundQueue, TimedCache
from pybot.utils.debug_state import DebugStateManager, DebugState

logging.basicConfig(level=logging.INFO)
load_dotenv()

CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000
GUILD_CACHE_TTL_MS = 15 * 60 * 1000
INVITE_CACHE_TTL_MS = 30 * 1000


class NexGenerationBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True
        intents.reactions = True
        super().__init__(command_prefix="!", intents=intents)
        self.config = resolve_config()
        self.settings = resolve_config()

        self.channel_cache = TimedCache(CHANNEL_CACHE_TTL_MS)
        self.guild_cache = TimedCache(GUILD_CACHE_TTL_MS)
        self.invite_cache = TimedCache(INVITE_CACHE_TTL_MS)
        self.background_queue = BackgroundQueue()

        self.giveaway_manager = GiveawayManager(self)
        self.debug_allowed_commands = {"update"}
        self.debug_manager = DebugStateManager(DEBUG_STATE_FILE)
        self.debug_state = self.debug_manager.load()
        self.debug_mode = self.debug_state.active
        self.pending_debug_notification = self.debug_mode
        self.startup_logs: list[tuple[str, str, str, Optional[dict]]] = []
        self.user_count_stats = {"non_bot": 0, "last_sync": 0}
        self.auto_mod_review_actions: dict[str, dict] = {}

    async def setup_hook(self) -> None:
        await self._load_extensions(
            [
                "pybot.commands.ping",
                "pybot.commands.say",
                "pybot.commands.suggestions",
                "pybot.events.ready",
                "pybot.events.message_create",
                "pybot.events.guild_member_add",
                "pybot.events.guild_member_remove",
                "pybot.events.interaction_create",
                "pybot.events.message_reaction_add",
                "pybot.events.message_reaction_remove",
                "pybot.events.invite_create",
                "pybot.events.invite_delete",
            ]
        )
        await self.tree.sync()

    async def _load_extensions(self, modules: Iterable[str]) -> None:
        for module in modules:
            try:
                await self.load_extension(module)
            except Exception as exc:  # pragma: no cover - best-effort loading
                logging.exception("No se pudo cargar la extensión %s", module, exc_info=exc)

    # ---- Performance helpers ----
    def run_in_background(self, task):
        self.background_queue.run(task)

    def invalidate_channel_cache(self, channel_id: int | str | None) -> None:
        if channel_id is None:
            return
        self.channel_cache.delete(str(channel_id))

    def invalidate_guild_cache(self, guild_id: int | str | None) -> None:
        if guild_id is None:
            return
        self.guild_cache.delete(str(guild_id))

    def invalidate_invite_cache(self, guild_id: int | str | None) -> None:
        if guild_id is None:
            return
        self.invite_cache.delete(str(guild_id))

    async def resolve_channel(
        self, channel_id: int | str | None, *, force: bool = False, ttl: int = CHANNEL_CACHE_TTL_MS
    ) -> Optional[discord.abc.GuildChannel]:
        if channel_id is None:
            return None
        normalized = str(channel_id)
        if not force:
            cached = self.channel_cache.get(normalized)
            if cached:
                return cached
            collection = self.get_channel(int(channel_id))
            if collection:
                return self.channel_cache.set(normalized, collection, ttl)
        else:
            self.channel_cache.delete(normalized)
        try:
            fetched = await self.fetch_channel(channel_id)
            if fetched:
                self.channel_cache.set(normalized, fetched, ttl)
            return fetched
        except discord.HTTPException:
            self.channel_cache.delete(normalized)
            return None

    async def resolve_guild(
        self, guild_id: int | str | None, *, force: bool = False, ttl: int = GUILD_CACHE_TTL_MS
    ) -> Optional[discord.Guild]:
        if guild_id is None:
            return None
        normalized = str(guild_id)
        if not force:
            cached = self.guild_cache.get(normalized) or self.get_guild(int(guild_id))
            if cached:
                self.guild_cache.set(normalized, cached, ttl)
                return cached
        else:
            self.guild_cache.delete(normalized)
        try:
            guild = await self.fetch_guild(guild_id)
            if guild:
                self.guild_cache.set(normalized, guild, ttl)
            return guild
        except discord.HTTPException:
            self.guild_cache.delete(normalized)
            return None

    async def get_invite_usage_summary(
        self, guild_like: discord.Guild | int | str | None, *, force: bool = False, ttl: int = INVITE_CACHE_TTL_MS
    ) -> dict[int, int]:
        normalized = str(getattr(guild_like, "id", guild_like)) if guild_like else None
        if not normalized:
            return {}
        if not force:
            cached = self.invite_cache.get(normalized)
            if cached:
                return cached
        else:
            self.invite_cache.delete(normalized)

        guild = guild_like
        if isinstance(guild_like, (int, str)):
            guild = await self.resolve_guild(guild_like)
        if guild is None:
            return {}
        try:
            invites = await guild.invites()
            summary: dict[int, int] = {}
            for invite in invites:
                inviter_id = invite.inviter.id if invite.inviter else None
                if inviter_id is None:
                    continue
                uses = invite.uses or 0
                summary[inviter_id] = summary.get(inviter_id, 0) + uses
            self.invite_cache.set(normalized, summary, ttl)
            return summary
        except Exception:
            self.invite_cache.delete(normalized)
            raise

    async def get_invite_uses(self, guild_like, user_id: int, *, ttl: int = INVITE_CACHE_TTL_MS) -> int:
        summary = await self.get_invite_usage_summary(guild_like, ttl=ttl)
        return summary.get(int(user_id), 0)

    async def update_presence_count(self, *, delta: int = 0, force: bool = False) -> int:
        if not self.user:
            return 0
        guild_id = self.settings.get("guildId")
        if guild_id is None:
            return self.user_count_stats["non_bot"]
        if force or self.user_count_stats["last_sync"] == 0:
            guild = await self.resolve_guild(guild_id)
            if guild:
                try:
                    members = await guild.fetch_members(limit=None).flatten()
                except Exception:
                    members = guild.members
                non_bot = sum(1 for m in members if not m.bot)
                self.user_count_stats["non_bot"] = non_bot
                self.user_count_stats["last_sync"] = int(time.time())
        elif delta:
            self.user_count_stats["non_bot"] = max(0, self.user_count_stats["non_bot"] + delta)

        activity_name = f"{self.user_count_stats['non_bot']} usuarios"
        try:
            await self.change_presence(
                activity=discord.Activity(name=activity_name, type=discord.ActivityType.watching),
                status=discord.Status.online,
            )
        except Exception:
            pass
        return self.user_count_stats["non_bot"]

    async def queue_startup_log(self, title: str, action: str, description: str, user: Optional[dict] = None) -> None:
        self.startup_logs.append((title, action, description, user))
        await self.log(title, action, description, user)

    async def log(self, title: str, action: str, description: str, user: Optional[dict] = None) -> None:
        channel_id = self.config.get("logs", {}).get("channelId")
        guild_id = self.config.get("logs", {}).get("guildId")
        if not channel_id or not guild_id:
            return
        channel = await self.resolve_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            return
        embed = discord.Embed(title=title, description=description, colour=discord.Colour.orange())
        embed.add_field(name="Acción", value=action, inline=False)
        if user:
            embed.set_footer(text=f"Usuario: {user.get('tag', user.get('id', ''))}")
        try:
            await channel.send(embed=embed)
        except Exception:
            logging.exception("No se pudo enviar el log")

    # ---- Debug helpers ----
    def build_debug_description(self) -> str:
        if not self.debug_state:
            return "Canal: Logs\nInterior: Activado automáticamente en modo debug."

        details = []
        if self.debug_state.reason:
            details.append(f"Motivo: {self.debug_state.reason}")
        if self.debug_state.error_message:
            details.append(f"Detalle: {self.debug_state.error_message[:1800]}")
        if not details:
            details.append("Detalle: No disponible")
        return "Canal: Logs\nInterior: Activado automáticamente en modo debug.\n" + "\n".join(details)

    async def notify_debug_mode(self) -> None:
        if not self.debug_mode or not self.pending_debug_notification:
            return
        try:
            await self.log("Modo debug activado", "Bot en modo debug", self.build_debug_description(), None)
            self.pending_debug_notification = False
        except Exception:
            logging.exception("No se pudo enviar la notificación de modo debug")

    def enter_debug_mode(self, reason: str, error: Exception | str | None = None) -> None:
        if self.debug_mode:
            return
        error_message: str | None
        if isinstance(error, Exception):
            error_message = str(error)
        else:
            error_message = error

        self.debug_mode = True
        self.debug_state = DebugState(
            active=True,
            reason=reason or "Error no especificado",
            error_message=error_message,
            activated_at=discord.utils.utcnow().isoformat(),
            triggered_during_startup=not self.is_ready(),
        )
        self.pending_debug_notification = True
        self.debug_manager.save(self.debug_state)

    async def exit_debug_mode(self, *, reason: str | None = None, skip_log: bool = False) -> None:
        if not self.debug_mode:
            self.debug_manager.save(DebugState(active=False))
            return

        self.debug_mode = False
        self.pending_debug_notification = False
        self.debug_state = DebugState(active=False, cleared_at=discord.utils.utcnow().isoformat(), cleared_reason=reason)
        self.debug_manager.save(self.debug_state)

        if not skip_log:
            description = f"Canal: Logs\nInterior: {reason or 'Modo debug desactivado automáticamente tras reinicio.'}"
            try:
                await self.log("Modo debug desactivado", "Bot operativo", description, None)
            except Exception:
                logging.exception("No se pudo enviar el log de desactivación de modo debug")


async def main() -> None:
    bot = NexGenerationBot()
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN no está definido en las variables de entorno")
    async with bot:
        await bot.start(token)


if __name__ == "__main__":
    asyncio.run(main())
