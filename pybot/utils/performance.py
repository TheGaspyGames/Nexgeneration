from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Dict, Hashable, Optional, TypeVar

T = TypeVar("T")


class TimedCache:
    def __init__(self, default_ttl: float = 60_000) -> None:
        self.default_ttl = default_ttl
        self.store: Dict[Hashable, tuple[float, T]] = {}

    def _now(self) -> float:
        return time.time() * 1000

    def _is_expired(self, key: Hashable, expires_at: float) -> bool:
        if expires_at == 0:
            return False
        return expires_at <= self._now()

    def set(self, key: Hashable, value: T, ttl: Optional[float] = None) -> T:
        if key is None:
            return value
        ttl_ms = self.default_ttl if ttl is None else ttl
        expires_at = self._now() + ttl_ms if ttl_ms and ttl_ms > 0 else 0
        self.store[key] = (expires_at, value)
        return value

    def get(self, key: Hashable) -> Optional[T]:
        if key is None:
            return None
        entry = self.store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if self._is_expired(key, expires_at):
            self.store.pop(key, None)
            return None
        return value

    def delete(self, key: Hashable) -> None:
        if key is None:
            return
        self.store.pop(key, None)

    def clear(self) -> None:
        self.store.clear()

    def prune(self) -> None:
        now = self._now()
        expired = [key for key, (expires_at, _) in self.store.items() if expires_at and expires_at <= now]
        for key in expired:
            self.store.pop(key, None)


class BackgroundQueue:
    def __init__(self) -> None:
        self.pending: set[asyncio.Task[None]] = set()

    def run(self, task: Callable[[], Awaitable[None] | None]):
        if not callable(task):
            return

        async def wrapped() -> None:
            try:
                result = task()
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:  # pragma: no cover - defensive logging only
                print(f"Error en una tarea en segundo plano: {exc}")
            finally:
                self.pending.discard(asyncio.current_task())

        task_obj = asyncio.create_task(wrapped())
        self.pending.add(task_obj)

    def size(self) -> int:
        return len(self.pending)

    def clear(self) -> None:
        for task in list(self.pending):
            task.cancel()
        self.pending.clear()
