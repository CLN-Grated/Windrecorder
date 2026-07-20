from __future__ import annotations

from typing import Any

from windrecorder.config import config
from windrecorder.llm import request_llm_one_shot
from windrecorder.utils import get_text as _t


def get_settings() -> dict[str, Any]:
    return {
        "enable_img_embed_search": config.enable_img_embed_search,
        "img_embed_module_install": config.img_embed_module_install,
        "ai_api_endpoint_type": config.ai_api_endpoint_type,
        "ai_api_endpoint_selected": config.ai_api_endpoint_selected,
        "open_ai_base_url": config.open_ai_base_url,
        "open_ai_modelname": config.open_ai_modelname,
        "open_ai_api_key_set": bool(config.open_ai_api_key),
        "enable_ai_extract_tag": config.enable_ai_extract_tag,
        "enable_ai_day_poem": config.enable_ai_day_poem,
        "ai_extract_tag_wintitle_limit": config.ai_extract_tag_wintitle_limit,
        "ai_extract_tag_filter_words": config.ai_extract_tag_filter_words,
    }


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "enable_img_embed_search",
        "ai_api_endpoint_selected",
        "open_ai_base_url",
        "open_ai_modelname",
        "enable_ai_extract_tag",
        "enable_ai_day_poem",
        "ai_extract_tag_wintitle_limit",
        "ai_extract_tag_filter_words",
    ]
    applied = []
    for k in keys:
        if k in payload:
            config.set_and_save_config(k, payload[k])
            applied.append(k)
    if "open_ai_api_key" in payload and payload["open_ai_api_key"]:
        config.set_and_save_config("open_ai_api_key", payload["open_ai_api_key"])
        applied.append("open_ai_api_key")
    return {"ok": True, "applied": applied}


def test_llm(base_url: str | None = None, api_key: str | None = None, model: str | None = None) -> dict[str, Any]:
    success, respond = request_llm_one_shot(
        user_content=_t("lab_prompt_test"),
        api_key=api_key if api_key is not None else config.open_ai_api_key,
        base_url=base_url if base_url is not None else config.open_ai_base_url,
        model=model if model is not None else config.open_ai_modelname,
    )
    return {"success": bool(success), "respond": str(respond)}
