from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class SuggestionModel:
    id: int
    scope: str = "public"
    author_id: str = ""
    author_tag: str = ""
    author_avatar: Optional[str] = None
    message_id: str = ""
    channel_id: str = ""
    content: str = ""
    status: str = "Pendiente"
    approvals: int = 0
    reason: Optional[str] = None
