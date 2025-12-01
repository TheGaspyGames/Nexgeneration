from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from typing import Dict, Iterable, Optional, Set

import discord

from .. import config

PARTICIPANTS_FIELD = "Participantes"
WATCHDOG_INTERVAL_MS = 5_000
INVITE_USAGE_TTL_MS = 60_000


@dataclass
class Giveaway:
    message_id: int
    channel_id: int
    guild_id: int
    prize: str
    winners: int
    host_id: int
    end_time: float
    min_messages: int = 0
    required_role: Optional[int] = None
    excluded_role: Optional[int] = None
    required_invites: int = 0
    participants: Set[int] = field(default_factory=set)
    ended: bool = False
    timeout_task: Optional[asyncio.Task[None]] = None
    message_cache: Optional[discord.Message] = None


class GiveawayManager:
    def __init__(self, bot: discord.Client) -> None:
        self.bot = bot
        self.giveaways: Dict[int, Giveaway] = {}
        self.message_count: Dict[int, int] = {}
        self.expiration_watcher: Optional[asyncio.Task[None]] = None
        self.start_expiration_watcher()

    def start_expiration_watcher(self) -> None:
        if self.expiration_watcher:
            return

        async def watcher() -> None:
            while True:
                try:
                    await asyncio.sleep(WATCHDOG_INTERVAL_MS / 1000)
                    await self.sweep_expired_giveaways()
                except asyncio.CancelledError:
                    break
                except Exception:
                    continue

        self.expiration_watcher = asyncio.create_task(watcher())

    def stop_expiration_watcher_if_idle(self) -> None:
        has_active = any(not g.ended for g in self.giveaways.values())
        if not has_active and self.expiration_watcher:
            self.expiration_watcher.cancel()
            self.expiration_watcher = None

    async def sweep_expired_giveaways(self) -> None:
        if not self.giveaways:
            self.stop_expiration_watcher_if_idle()
            return

        now = time.time() * 1000
        pending: Iterable[asyncio.Task[None]] = []
        for message_id, giveaway in list(self.giveaways.items()):
            if giveaway.ended or giveaway.end_time > now:
                continue
            pending_task = asyncio.create_task(self.end_giveaway(message_id))
            pending_task.add_done_callback(lambda _t: None)
            pending = list(pending) + [pending_task]

        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    async def create_giveaway(
        self,
        *,
        channel_id: int,
        duration: str,
        winners: int,
        prize: str,
        host: discord.User,
        min_messages: int = 0,
        required_role: Optional[int] = None,
        excluded_role: Optional[int] = None,
        required_invites: int = 0,
    ) -> Optional[Giveaway]:
        channel = await self.bot.resolve_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            return None

        duration_ms = parse_duration(duration)
        if duration_ms is None:
            raise ValueError("Duración del sorteo inválida. Usa valores como 30s, 5m, 1h, etc.")

        end_time = time.time() * 1000 + duration_ms
        requirements = []
        if min_messages > 0:
            requirements.append(f"Mensajes mínimos: {min_messages}")
        if required_role:
            requirements.append(f"Rol requerido: <@&{required_role}>")
        if excluded_role:
            requirements.append(f"Rol bloqueado: <@&{excluded_role}>")
        if not requirements:
            requirements.append("Ninguno")

        embed = discord.Embed(
            title="🎉 SORTEO",
            description=(
                f"**Premio:** {prize}\n**Ganadores:** {winners}\n**Host:** {host}\n"
                f"**Termina:** <t:{int(end_time/1000)}:R>\n\nReacciona con 🎉 para participar!"
            ),
            colour=discord.Colour.from_str(config.DEFAULT_CONFIG["embedColor"]),
        )
        embed.set_footer(text=f"Termina el {time.strftime('%c', time.localtime(end_time/1000))}")
        embed.add_field(name="Requisitos", value="\n".join(requirements))
        if required_invites and required_invites > 0:
            embed.add_field(name="Invites requeridos", value=f"{required_invites} invite(s)", inline=False)
        embed.add_field(name=PARTICIPANTS_FIELD, value="0", inline=False)

        view = discord.ui.View()
        view.add_item(
            discord.ui.Button(
                custom_id="giveaway-join",
                label="Participar",
                style=discord.ButtonStyle.primary,
                emoji="🎉",
            )
        )
        view.add_item(
            discord.ui.Button(
                custom_id="giveaway-participants",
                label="Participantes",
                style=discord.ButtonStyle.secondary,
            )
        )

        message = await channel.send(embed=embed, view=view)

        giveaway = Giveaway(
            message_id=int(message.id),
            channel_id=int(channel.id),
            guild_id=int(channel.guild.id),
            prize=prize,
            winners=int(winners),
            host_id=int(host.id),
            end_time=end_time,
            min_messages=min_messages,
            required_role=required_role,
            excluded_role=excluded_role,
            required_invites=required_invites,
            message_cache=message,
        )

        self.giveaways[int(message.id)] = giveaway
        self.set_timer(message.id)
        self.start_expiration_watcher()
        return giveaway

    async def end_giveaway(self, message_id: int) -> None:
        giveaway = self.giveaways.get(int(message_id))
        if not giveaway or giveaway.ended:
            return

        message = await self.get_or_fetch_message(giveaway)
        channel = message.channel if message else await self.bot.resolve_channel(giveaway.channel_id)
        if not isinstance(channel, discord.TextChannel):
            return

        participants = list(giveaway.participants)
        winners: list[int] = []
        for _ in range(min(giveaway.winners, len(participants))):
            idx = random.randrange(len(participants))
            winners.append(participants.pop(idx))

        winner_mentions = ", ".join(f"<@{wid}>" for wid in winners) if winners else "Nadie participó"

        requirements = []
        if giveaway.min_messages:
            requirements.append(f"Mensajes mínimos: {giveaway.min_messages}")
        if giveaway.required_role:
            requirements.append(f"Rol requerido: <@&{giveaway.required_role}>")
        if giveaway.excluded_role:
            requirements.append(f"Rol bloqueado: <@&{giveaway.excluded_role}>")
        if not requirements:
            requirements.append("Ninguno")

        embed = discord.Embed(
            title="🎉 SORTEO TERMINADO",
            description=f"**Premio:** {giveaway.prize}\n**Ganadores:** {winner_mentions}\n**Host:** <@{giveaway.host_id}>",
            colour=discord.Colour.from_str(config.DEFAULT_CONFIG["embedColor"]),
        )
        embed.set_footer(text="Sorteo finalizado")
        embed.add_field(name="Requisitos", value="\n".join(requirements))
        if giveaway.required_invites and giveaway.required_invites > 0:
            embed.add_field(name="Invites requeridos", value=f"{giveaway.required_invites} invite(s)", inline=False)

        if message:
            await message.edit(embed=embed, view=None)
            giveaway.message_cache = message

        if winners:
            await channel.send(
                content=f"¡Felicitaciones {winner_mentions}! Han ganado: **{giveaway.prize}**",
                allowed_mentions=discord.AllowedMentions(users=[discord.Object(id=w) for w in winners]),
            )

        giveaway.ended = True
        if giveaway.timeout_task:
            giveaway.timeout_task.cancel()
            giveaway.timeout_task = None
        self.giveaways[int(message_id)] = giveaway
        self.stop_expiration_watcher_if_idle()

    def set_timer(self, message_id: int) -> None:
        giveaway = self.giveaways.get(int(message_id))
        if not giveaway:
            return

        if giveaway.timeout_task:
            giveaway.timeout_task.cancel()
            giveaway.timeout_task = None

        delay = max(0, (giveaway.end_time - time.time() * 1000) / 1000)
        if delay == 0:
            asyncio.create_task(self.end_giveaway(message_id))
            return

        giveaway.timeout_task = asyncio.create_task(self._delayed_end(message_id, delay))
        self.giveaways[int(message_id)] = giveaway

    async def _delayed_end(self, message_id: int, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
            await self.end_giveaway(message_id)
        except asyncio.CancelledError:
            return
        except Exception:
            return

    async def handle_join(self, interaction: discord.Interaction) -> None:
        giveaway = self.giveaways.get(int(interaction.message.id)) if interaction.message else None
        if not giveaway or giveaway.ended:
            await interaction.response.send_message("❌ Este sorteo ya ha terminado.", ephemeral=True)
            return

        if giveaway.min_messages > 0:
            user_messages = self.message_count.get(interaction.user.id, 0)
            if user_messages < giveaway.min_messages:
                await interaction.response.send_message(
                    f"❌ Necesitas tener al menos {giveaway.min_messages} mensajes en el servidor para participar. Actualmente tienes {user_messages} mensajes.",
                    ephemeral=True,
                )
                return

        member: Optional[discord.Member] = None
        if giveaway.required_role or giveaway.excluded_role:
            try:
                member = await interaction.guild.fetch_member(interaction.user.id) if interaction.guild else None
            except discord.HTTPException:
                member = None

        if giveaway.required_role and member and giveaway.required_role not in [r.id for r in member.roles]:
            await interaction.response.send_message(
                f"❌ Necesitas el rol <@&{giveaway.required_role}> para participar en este sorteo.", ephemeral=True
            )
            return

        if giveaway.excluded_role and member and giveaway.excluded_role in [r.id for r in member.roles]:
            await interaction.response.send_message(
                f"❌ El rol <@&{giveaway.excluded_role}> no puede participar en este sorteo.", ephemeral=True
            )
            return

        if giveaway.required_invites and giveaway.required_invites > 0:
            try:
                uses = await self.bot.get_invite_uses(interaction.guild, interaction.user.id, ttl=INVITE_USAGE_TTL_MS)
                if uses < giveaway.required_invites:
                    await interaction.response.send_message(
                        f"❌ Necesitas al menos {giveaway.required_invites} invite(s) (usos) para participar. Actualmente tienes {uses}.",
                        ephemeral=True,
                    )
                    return
            except Exception:
                await interaction.response.send_message(
                    "❌ No se pudo verificar tus invites. Asegúrate de que el bot tenga permiso para ver las invites.",
                    ephemeral=True,
                )
                return

        if interaction.user.id in giveaway.participants:
            view = discord.ui.View()
            view.add_item(
                discord.ui.Button(
                    custom_id=f"giveaway-leave:{interaction.message.id}",
                    label="Salir del sorteo",
                    style=discord.ButtonStyle.danger,
                )
            )
            await interaction.response.send_message(
                content="¿Estás seguro de salir del sorteo?", view=view, ephemeral=True
            )
        else:
            giveaway.participants.add(interaction.user.id)
            self.giveaways[int(interaction.message.id)] = giveaway
            await interaction.response.send_message("✅ ¡Has entrado al sorteo!", ephemeral=True)
            await self.update_participants_field(interaction.message, giveaway)

    async def handle_leave(self, interaction: discord.Interaction) -> None:
        custom_id = interaction.data.get("custom_id") if interaction.data else None
        parts = custom_id.split(":") if custom_id else []
        if len(parts) < 2:
            await interaction.response.send_message("❌ No se pudo procesar tu solicitud.", ephemeral=True)
            return

        message_id = int(parts[1])
        giveaway = self.giveaways.get(message_id)
        if not giveaway or giveaway.ended:
            await interaction.response.edit_message(content="❌ Este sorteo ya no está disponible.", view=None)
            return

        if interaction.user.id not in giveaway.participants:
            await interaction.response.edit_message(content="⚠️ Ya no estás participando en este sorteo.", view=None)
            return

        giveaway.participants.discard(interaction.user.id)
        self.giveaways[message_id] = giveaway
        await self.update_participants_field(None, giveaway)
        await interaction.response.edit_message(content="❌ Has abandonado el sorteo.", view=None)

    async def handle_participants(self, interaction: discord.Interaction) -> None:
        giveaway = self.giveaways.get(int(interaction.message.id)) if interaction.message else None
        if not giveaway:
            await interaction.response.send_message(
                "❌ No se encontró información sobre este sorteo.", ephemeral=True
            )
            return

        participants = list(giveaway.participants)
        participant_count = len(participants)
        participant_list = (
            "\n".join(f"{idx + 1}.- <@{pid}>" for idx, pid in enumerate(participants))
            if participant_count
            else "No hay participantes registrados todavía."
        )

        embed = discord.Embed(
            title="📋 Participantes del sorteo",
            description=participant_list,
            colour=discord.Colour.blurple(),
        )
        embed.add_field(name="Total", value=str(participant_count), inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    async def update_participants_field(
        self, message: Optional[discord.Message], giveaway: Giveaway
    ) -> None:
        try:
            target_message = message or await self.get_or_fetch_message(giveaway)
            if not target_message or not target_message.embeds:
                return

            embed = target_message.embeds[0]
            embed_dict = embed.to_dict()
            fields = embed_dict.get("fields", [])
            participant_index = next(
                (idx for idx, field in enumerate(fields) if field.get("name") == PARTICIPANTS_FIELD),
                -1,
            )
            participant_value = str(len(giveaway.participants))
            if participant_index != -1:
                fields[participant_index]["value"] = participant_value
            else:
                fields.append({"name": PARTICIPANTS_FIELD, "value": participant_value, "inline": False})

            embed_dict["fields"] = fields
            updated_embed = discord.Embed.from_dict(embed_dict)
            await target_message.edit(embed=updated_embed, view=target_message.components)
            giveaway.message_cache = target_message
            self.giveaways[int(giveaway.message_id)] = giveaway
        except Exception:
            return

    async def get_or_fetch_message(self, giveaway: Giveaway) -> Optional[discord.Message]:
        if giveaway.message_cache and giveaway.message_cache.id == giveaway.message_id:
            return giveaway.message_cache
        channel = await self.bot.resolve_channel(giveaway.channel_id)
        if not isinstance(channel, discord.TextChannel):
            return None
        try:
            message = await channel.fetch_message(giveaway.message_id)
            giveaway.message_cache = message
            self.giveaways[int(giveaway.message_id)] = giveaway
            return message
        except discord.HTTPException:
            return None


def parse_duration(text: str) -> Optional[int]:
    if not text:
        return None
    text = text.strip().lower()
    units = {"s": 1000, "m": 60_000, "h": 3_600_000, "d": 86_400_000}
    if text[-1] in units:
        try:
            value = float(text[:-1])
            return int(value * units[text[-1]])
        except ValueError:
            return None
    try:
        return int(float(text) * 1000)
    except ValueError:
        return None
