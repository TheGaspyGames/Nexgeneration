import json
import os
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "pybot_config"
LEGACY_CONFIG_DIR = ROOT_DIR / "config"
SETTINGS_FILE = CONFIG_DIR / "settings.json"
LEGACY_SETTINGS_FILE = LEGACY_CONFIG_DIR / "settings.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "embedColor": "#FF5733",
    "giveawayEmoji": "🎉",
    "suggestionsChannel": "ID_DEL_CANAL_DE_SUGERENCIAS",
    "staffSuggestionsChannel": "1439649094145544326",
    "staffSuggestionsGuildId": "1433154337227542792",
    "logs": {
        "guildId": "1433154337227542792",
        "channelId": "1435121677649449120",
    },
    "minecraftServer": {
        "host": "nexgneration.sdlf.fun",
        "port": 49376,
        "bedrockHosts": ["nexgneration.sdlf.fun", "ns570401.seedloaf.com"],
        "statusTimeoutMs": 4000,
    },
    "autoModeration": {
        "enabled": True,
        "maxMentions": 5,
        "maxLines": 10_000_000_000,
        "bannedWords": [],
        "ignoredRoles": [],
        "ignoredUsers": [],
        "reportChannelId": "1439349036644569359",
        "reviewChannelId": "1439361552598696147",
    },
    "autoroles": {
        "enabled": True,
        "roles": [],
    },
}


def _read_json(file_path: Path) -> Dict[str, Any]:
    try:
        return json.loads(file_path.read_text(encoding="utf-8").strip() or "{}")
    except (OSError, json.JSONDecodeError):
        return {}


def load_settings() -> Dict[str, Any]:
    """Load persisted settings, migrating legacy files if needed."""
    if SETTINGS_FILE.exists():
        return _read_json(SETTINGS_FILE)

    if LEGACY_SETTINGS_FILE.exists():
        settings = _read_json(LEGACY_SETTINGS_FILE)
        save_settings(settings)
        return settings

    return {}


def save_settings(settings: Dict[str, Any]) -> None:
    """Persist settings to the managed config folder, creating it if needed."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_FILE.write_text(json.dumps(settings, indent=4), encoding="utf-8")
    except OSError:
        # Failing to persist settings should not crash command execution.
        pass


def get_setting(key: str, fallback: Any = None) -> Any:
    settings = load_settings()
    return settings.get(key, fallback)


def set_setting(key: str, value: Any) -> Dict[str, Any]:
    settings = load_settings()
    settings[key] = value
    save_settings(settings)
    return settings


def resolve_config() -> Dict[str, Any]:
    """Return a merged configuration combining defaults and persisted settings."""
    merged = DEFAULT_CONFIG.copy()
    merged.update(load_settings())
    return merged


def mongo_uri() -> str | None:
    return os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")
