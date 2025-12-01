from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional

import discord
from motor.motor_asyncio import AsyncIOMotorClient

from .config import mongo_uri


@dataclass
class SuggestionRecord:
    id: int
    scope: str
    author_id: str
    author_tag: str
    author_avatar: str | None
    message_id: str
    channel_id: str
    content: str
    status: str
    approvals: int
    reason: str | None


class SuggestionRepository:
    def __init__(self, connection_uri: str | None):
        self._connection_uri = connection_uri
        self._client: AsyncIOMotorClient | None = None
        self._db_name = "nexgeneration"
        self._counter_collection = "counters"
        self._suggestions_collection = "suggestions"

    async def _client_or_none(self) -> Optional[AsyncIOMotorClient]:
        if not self._connection_uri:
            return None
        if self._client is None:
            self._client = AsyncIOMotorClient(self._connection_uri, serverSelectionTimeoutMS=3000)
        try:
            await self._client.server_info()
        except Exception:
            return None
        return self._client

    async def is_connected(self) -> bool:
        return (await self._client_or_none()) is not None

    async def get_next_sequence(self, name: str) -> Optional[int]:
        client = await self._client_or_none()
        if client is None:
            return None
        db = client[self._db_name]
        result = await db[self._counter_collection].find_one_and_update(
            {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
        )
        return result.get("seq") if result else None

    async def save_suggestion(self, payload: Dict[str, Any]) -> bool:
        client = await self._client_or_none()
        if client is None:
            return False
        db = client[self._db_name]
        try:
            await db[self._suggestions_collection].insert_one(payload)
            return True
        except Exception:
            return False

    async def get_suggestion(self, suggestion_id: int) -> Optional[SuggestionRecord]:
        client = await self._client_or_none()
        if client is None:
            return None
        db = client[self._db_name]
        doc = await db[self._suggestions_collection].find_one(
            {"id": suggestion_id, "$or": [{"scope": {"$exists": False}}, {"scope": "public"}]}
        )
        if not doc:
            return None
        return SuggestionRecord(
            id=doc.get("id"),
            scope=doc.get("scope", "public"),
            author_id=doc.get("authorId", ""),
            author_tag=doc.get("authorTag", ""),
            author_avatar=doc.get("authorAvatar"),
            message_id=doc.get("messageId", ""),
            channel_id=doc.get("channelId", ""),
            content=doc.get("content", ""),
            status=doc.get("status", "Pendiente"),
            approvals=doc.get("approvals", 0),
            reason=doc.get("reason"),
        )

    async def update_suggestion(self, suggestion_id: int, updates: Dict[str, Any]) -> None:
        client = await self._client_or_none()
        if client is None:
            return
        db = client[self._db_name]
        await db[self._suggestions_collection].update_one({"id": suggestion_id}, {"$set": updates})

    async def get_suggestion_by_message(self, message_id: str) -> Optional[SuggestionRecord]:
        client = await self._client_or_none()
        if client is None:
            return None
        db = client[self._db_name]
        doc = await db[self._suggestions_collection].find_one({"messageId": str(message_id)})
        if not doc:
            return None
        return SuggestionRecord(
            id=doc.get("id"),
            scope=doc.get("scope", "public"),
            author_id=doc.get("authorId", ""),
            author_tag=doc.get("authorTag", ""),
            author_avatar=doc.get("authorAvatar"),
            message_id=doc.get("messageId", ""),
            channel_id=doc.get("channelId", ""),
            content=doc.get("content", ""),
            status=doc.get("status", "Pendiente"),
            approvals=doc.get("approvals", 0),
            reason=doc.get("reason"),
        )

    async def update_approvals(self, suggestion_id: int, approvals: int) -> None:
        client = await self._client_or_none()
        if client is None:
            return
        db = client[self._db_name]
        await db[self._suggestions_collection].update_one(
            {"id": suggestion_id}, {"$set": {"approvals": approvals, "updatedAt": discord.utils.utcnow()}}
        )


suggestions_repository = SuggestionRepository(mongo_uri())


async def is_mongo_connected() -> bool:
    return await suggestions_repository.is_connected()


def run_sync(coro):
    return asyncio.get_event_loop().run_until_complete(coro)
