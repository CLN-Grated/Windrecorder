from __future__ import annotations

from typing import Any

from windrecorder import __version__
from windrecorder.config import config
from windrecorder.state import make_webui_footer_state_data_cache


def get_public_config() -> dict[str, Any]:
    """Frontend-safe config subset (no raw secrets beyond presence flags)."""
    api_key = getattr(config, "open_ai_api_key", "") or ""
    return {
        "version": __version__,
        "lang": config.lang,
        "webui_backend": getattr(config, "webui_backend", "fastapi"),
        "record_mode": config.record_mode,
        "day_begin_minutes": config.day_begin_minutes,
        "max_page_result": config.max_page_result,
        "enable_3_columns_in_oneday": config.enable_3_columns_in_oneday,
        "enable_img_embed_search": config.enable_img_embed_search,
        "img_embed_module_install": config.img_embed_module_install,
        "enable_synonyms_recommend": config.enable_synonyms_recommend,
        "enable_ai_extract_tag": config.enable_ai_extract_tag,
        "enable_ai_day_poem": config.enable_ai_day_poem,
        "enable_ocr_str_highlight_indicator": config.enable_ocr_str_highlight_indicator,
        "record_deep_linking": config.record_deep_linking,
        "webui_password_enabled": bool(config.webui_access_password_md5),
        "open_ai_base_url": config.open_ai_base_url,
        "open_ai_modelname": config.open_ai_modelname,
        "open_ai_api_key_set": bool(api_key),
        "open_ai_api_key_masked": ("*" * min(8, len(api_key))) if api_key else "",
    }


def get_footer_state() -> dict[str, Any]:
    try:
        return make_webui_footer_state_data_cache(ask_from="webui") or {}
    except Exception:
        return {}
