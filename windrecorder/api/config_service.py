from __future__ import annotations

from typing import Any

from windrecorder import __version__
from windrecorder.config import config
from windrecorder.state import make_webui_footer_state_data_cache


def get_public_config() -> dict[str, Any]:
    """Frontend-safe config subset (no AI secrets; password only as enabled flag)."""
    return {
        "version": __version__,
        "lang": "sc",  # 产品已固定简体中文，不再支持多语言
        "record_mode": config.record_mode,
        "day_begin_minutes": config.day_begin_minutes,
        "max_page_result": config.max_page_result,
        "enable_3_columns_in_oneday": config.enable_3_columns_in_oneday,
        "enable_ocr_str_highlight_indicator": config.enable_ocr_str_highlight_indicator,
        "record_deep_linking": config.record_deep_linking,
        "webui_password_enabled": bool(
            (getattr(config, "webui_access_password_hash", None) or "")
            or (getattr(config, "webui_access_password_md5", None) or "")
        ),
        "OCR_index_strategy": config.OCR_index_strategy,
    }


def get_footer_state() -> dict[str, Any]:
    try:
        return make_webui_footer_state_data_cache(ask_from="webui") or {}
    except Exception:
        return {}
