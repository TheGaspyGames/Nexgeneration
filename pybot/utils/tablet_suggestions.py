from __future__ import annotations

import time
from typing import Any, Dict, Optional


tablet_suggestions: Dict[int, Dict[str, Any]] = {}


def _normalize_id(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def remember_tablet_suggestion(payload: Dict[str, Any] | None = None) -> Optional[Dict[str, Any]]:
    payload = payload or {}
    normalized_id = _normalize_id(payload.get("id"))
    if normalized_id is None:
        return None

    now_ms = int(time.time() * 1000)
    entry = {
        **payload,
        "id": normalized_id,
        "origin": "tablet",
        "storedAt": payload.get("storedAt") or now_ms,
        "updatedAt": now_ms,
    }
    tablet_suggestions[normalized_id] = entry
    return entry


def get_tablet_suggestion(suggestion_id: Any) -> Optional[Dict[str, Any]]:
    normalized_id = _normalize_id(suggestion_id)
    if normalized_id is None:
        return None
    return tablet_suggestions.get(normalized_id)


def update_tablet_suggestion(suggestion_id: Any, updates: Dict[str, Any] | None = None) -> Optional[Dict[str, Any]]:
    updates = updates or {}
    normalized_id = _normalize_id(suggestion_id)
    if normalized_id is None:
        return None
    current = tablet_suggestions.get(normalized_id)
    if not current:
        return None

    updated = {**current, **updates, "updatedAt": int(time.time() * 1000)}
    tablet_suggestions[normalized_id] = updated
    return updated


def forget_tablet_suggestion(suggestion_id: Any) -> bool:
    normalized_id = _normalize_id(suggestion_id)
    if normalized_id is None:
        return False
    return tablet_suggestions.pop(normalized_id, None) is not None
