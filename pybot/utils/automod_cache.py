from __future__ import annotations

import re
from typing import List

from .. import config

ESCAPE_REGEX = re.compile(r"[.*+?^${}()|[\]\\]")


class BannedWordCache:
    def __init__(self) -> None:
        self.invalidate()

    def invalidate(self) -> None:
        self.signature: str | None = None
        self.regex: re.Pattern[str] | None = None
        self.highlight_regex: re.Pattern[str] | None = None
        self.words: List[str] = []

    def _build(self) -> None:
        cfg = config.resolve_config()
        words = [word.strip() for word in cfg.get("autoModeration", {}).get("bannedWords", []) if isinstance(word, str)]
        signature = "|".join(words)
        if signature == self.signature:
            return

        self.signature = signature
        self.words = words

        if not words:
            self.regex = None
            self.highlight_regex = None
            return

        escaped = "|".join(ESCAPE_REGEX.sub(r"\\\\$&", word) for word in words)
        self.regex = re.compile(f"({escaped})", re.IGNORECASE)
        self.highlight_regex = re.compile(f"({escaped})", re.IGNORECASE)

    def get_matches(self, content: str) -> List[str]:
        if not content:
            return []
        self._build()
        if not self.regex:
            return []
        return [match.lower() for match in self.regex.findall(content)]

    def highlight(self, content: str) -> str:
        if not content:
            return "*Sin contenido*"
        self._build()
        if not self.highlight_regex:
            return content
        return self.highlight_regex.sub(r"**\\1**", content)


automod_cache = BannedWordCache()
