from __future__ import annotations

import json
import os
from typing import Any

from windrecorder.config import config
from windrecorder.utils import d_lang


def get_messages(lang: str | None = None) -> dict[str, Any]:
    """Return i18n dict for one language, falling back to en for missing keys."""
    code = lang or config.lang or "en"
    if code not in d_lang or code == "lang_map":
        code = "en"
    base = dict(d_lang.get("en", {}))
    if code != "en":
        base.update(d_lang.get(code, {}))
    return {"lang": code, "messages": base, "available": [k for k in d_lang.keys() if k != "lang_map"]}


def get_text(key: str, lang: str | None = None, **kwargs) -> str:
    data = get_messages(lang)
    text = data["messages"].get(key, f"({key}) not found in i18n")
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, ValueError):
            return text
    return text


def reload_languages_from_disk() -> None:
    """Hot-reload languages.json into utils.d_lang (rare; used after edits)."""
    import windrecorder.utils as utils

    path = os.path.join(config.config_src_dir, "languages.json")
    with open(path, encoding="utf-8") as f:
        utils.d_lang = json.load(f)
