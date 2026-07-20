from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from windrecorder import __version__, file_utils, record, utils
from windrecorder.config import config
from windrecorder.const import OCR_SUPPORT_CONFIG
from windrecorder.logger import get_logger

logger = get_logger(__name__)


def get_db_status() -> dict[str, Any]:
    count, nocred_count = file_utils.get_videos_and_ocred_videos_count(config.record_videos_dir_ud)
    return {
        "video_count": count,
        "unindexed_count": nocred_count,
        "OCR_index_strategy": config.OCR_index_strategy,
        "estimate_indexing_time": utils.estimate_indexing_time(),
        "is_recording": bool(record.is_recording()) if hasattr(record, "is_recording") else False,
    }


def get_options() -> dict[str, Any]:
    try:
        os_langs = utils.get_os_support_lang()
    except Exception:
        os_langs = []
    ocr_support = {}
    for eng, meta in OCR_SUPPORT_CONFIG.items():
        ocr_support[eng] = {
            "support_multiple_languages": meta.get("support_multiple_languages", False),
            "support_lang_option": meta.get("support_lang_option", {}),
        }
    return {
        "settings": {
            "lang": config.lang,
            "ocr_engine": config.ocr_engine,
            "ocr_lang": config.ocr_lang,
            "third_party_engine_ocr_lang": config.third_party_engine_ocr_lang,
            "support_ocr_lst": config.support_ocr_lst,
            "index_reduce_same_content_at_different_time": config.index_reduce_same_content_at_different_time,
            "recycle_deleted_files": config.recycle_deleted_files,
            "enable_3_columns_in_oneday": config.enable_3_columns_in_oneday,
            "use_similar_ch_char_to_search": config.use_similar_ch_char_to_search,
            "enable_synonyms_recommend": config.enable_synonyms_recommend,
            "max_page_result": config.max_page_result,
            "day_begin_minutes": config.day_begin_minutes,
            "oneday_timeline_pic_num": config.oneday_timeline_pic_num,
            "ocr_image_crop_URBL": config.ocr_image_crop_URBL,
            "wordcloud_user_stop_words": config.wordcloud_user_stop_words,
            "enable_month_lightbox_watermark": config.enable_month_lightbox_watermark,
            "img_embed_search_recall_result_per_db": config.img_embed_search_recall_result_per_db,
            "webui_password_enabled": bool(config.webui_access_password_md5),
            "webui_backend": getattr(config, "webui_backend", "fastapi"),
        },
        "os_support_lang": os_langs,
        "ocr_support": ocr_support,
        "db_status": get_db_status(),
        "lang_map": utils.d_lang.get("lang_map", {}),
    }


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    mapping = [
        "ocr_engine",
        "ocr_lang",
        "third_party_engine_ocr_lang",
        "index_reduce_same_content_at_different_time",
        "recycle_deleted_files",
        "enable_3_columns_in_oneday",
        "use_similar_ch_char_to_search",
        "enable_synonyms_recommend",
        "max_page_result",
        "day_begin_minutes",
        "oneday_timeline_pic_num",
        "ocr_image_crop_URBL",
        "wordcloud_user_stop_words",
        "enable_month_lightbox_watermark",
        "img_embed_search_recall_result_per_db",
        "webui_backend",
    ]
    applied = []
    for key in mapping:
        if key in payload:
            config.set_and_save_config(key, payload[key])
            applied.append(key)
    if "lang" in payload:
        config.set_and_save_config("lang", payload["lang"])
        applied.append("lang")
    if "webui_access_password" in payload:
        pwd = payload["webui_access_password"]
        if pwd is None:
            pass
        elif pwd == "":
            config.set_and_save_config("webui_access_password_md5", "")
            applied.append("webui_access_password_md5")
        else:
            config.set_and_save_config("webui_access_password_md5", hashlib.md5(str(pwd).encode("utf-8")).hexdigest())
            applied.append("webui_access_password_md5")
    return {"ok": True, "applied": applied}


def get_about() -> dict[str, Any]:
    update_info = ""
    new_version = None
    try:
        new_version = utils.get_new_version_if_available()
    except Exception as e:
        update_info = str(e)
    about_md = ""
    try:
        path = Path(f"{config.config_src_dir}\\about_{config.lang}.md")
        if path.exists():
            about_md = path.read_text(encoding="utf-8").format(
                version=__version__,
                update_info=update_info or ("latest" if new_version is None else str(new_version)),
            )
    except Exception as e:
        logger.debug(e)
    return {"version": __version__, "new_version": new_version, "about_markdown": about_md}
