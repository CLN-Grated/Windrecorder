"""Legacy stub: multi-language i18n removed; product is Simplified Chinese only."""

from __future__ import annotations

from typing import Any

from windrecorder.utils import get_text as _get_text


def get_messages(lang: str | None = None) -> dict[str, Any]:
    """Return Chinese messages only (lang argument ignored)."""
    from windrecorder.utils import _zh_messages

    return {"lang": "sc", "messages": dict(_zh_messages), "available": ["sc"]}


def get_text(key: str, lang: str | None = None, **kwargs) -> str:
    text = _get_text(key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, ValueError):
            return text
    return text


def reload_languages_from_disk() -> None:
    """Hot-reload languages.json into utils (rare; used after edits)."""
    import json
    import os

    import windrecorder.utils as utils
    from windrecorder.config import config

    path = os.path.join(config.config_src_dir, "languages.json")
    with open(path, encoding="utf-8") as f:
        utils._zh_messages = json.load(f)
    utils.d_lang = {
        "sc": utils._zh_messages,
        "en": utils._zh_messages,
        "ja": utils._zh_messages,
        "lang_map": {"sc": "简体中文"},
    }
