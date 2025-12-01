from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass
class DebugState:
    active: bool = False
    reason: str | None = None
    error_message: str | None = None
    activated_at: str | None = None
    triggered_during_startup: bool = False
    cleared_at: str | None = None
    cleared_reason: str | None = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "active": self.active,
            "reason": self.reason,
            "errorMessage": self.error_message,
            "activatedAt": self.activated_at,
            "triggeredDuringStartup": self.triggered_during_startup,
            "clearedAt": self.cleared_at,
            "clearedReason": self.cleared_reason,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DebugState":
        return cls(
            active=bool(data.get("active", False)),
            reason=data.get("reason"),
            error_message=data.get("errorMessage"),
            activated_at=data.get("activatedAt"),
            triggered_during_startup=bool(data.get("triggeredDuringStartup", False)),
            cleared_at=data.get("clearedAt"),
            cleared_reason=data.get("clearedReason"),
        )


class DebugStateManager:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self.default_state = DebugState()

    def load(self) -> DebugState:
        if not self.file_path.exists():
            self.save(self.default_state)
            return DebugState()
        try:
            payload = json.loads(self.file_path.read_text(encoding="utf-8").strip() or "{}")
            return DebugState.from_dict(payload)
        except (OSError, json.JSONDecodeError):
            return DebugState()

    def save(self, state: DebugState) -> None:
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            self.file_path.write_text(json.dumps(state.to_dict(), indent=2), encoding="utf-8")
        except OSError:
            # Failure to persist debug state should not break the bot.
            pass
