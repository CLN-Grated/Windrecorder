from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from windrecorder import __version__, file_utils, record, utils
from windrecorder.config import config
from windrecorder.const import OCR_SUPPORT_CONFIG
from windrecorder.logger import get_logger

logger = get_logger(__name__)

_update_lock = threading.Lock()
_update_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "error": None,
    "time_cost_seconds": None,
    "shutdown_after": False,
}


def get_db_status() -> dict[str, Any]:
    count, nocred_count = file_utils.get_videos_and_ocred_videos_count(config.record_videos_dir_ud)
    strategy = config.OCR_index_strategy
    is_rec = bool(record.is_recording()) if hasattr(record, "is_recording") else False
    estimate = utils.estimate_indexing_time()

    # Align messaging levels with draw_db_status in ui/setting.py
    if strategy == 1:
        if nocred_count == 1 and is_rec:
            level, msg_key = "success", "set_text_one_video_to_index"
        elif nocred_count == 0:
            level, msg_key = "success", "set_text_no_video_need_index"
        else:
            level, msg_key = "success", "set_text_some_video_will_be_index"
    else:
        if nocred_count == 1 and is_rec:
            level, msg_key = "success", "set_text_one_video_to_index"
        elif nocred_count >= 1:
            level, msg_key = "warning", "set_text_video_not_index"
        else:
            level, msg_key = "success", "set_text_no_video_need_index"

    return {
        "video_count": count,
        "unindexed_count": nocred_count,
        "OCR_index_strategy": strategy,
        "estimate_indexing_time": estimate,
        "is_recording": is_rec,
        "level": level,
        "message_key": msg_key,
        "manual_update_available": strategy == 0,
        "update_job": dict(_update_state),
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
            "max_page_result": config.max_page_result,
            "day_begin_minutes": config.day_begin_minutes,
            "oneday_timeline_pic_num": config.oneday_timeline_pic_num,
            "ocr_image_crop_URBL": config.ocr_image_crop_URBL,
            "wordcloud_user_stop_words": config.wordcloud_user_stop_words,
            "enable_month_lightbox_watermark": config.enable_month_lightbox_watermark,
            "webui_password_enabled": bool(
                (getattr(config, "webui_access_password_hash", None) or "")
                or (getattr(config, "webui_access_password_md5", None) or "")
            ),
            "webui_backend": getattr(config, "webui_backend", "fastapi"),
            "OCR_index_strategy": config.OCR_index_strategy,
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
        "max_page_result",
        "day_begin_minutes",
        "oneday_timeline_pic_num",
        "ocr_image_crop_URBL",
        "wordcloud_user_stop_words",
        "enable_month_lightbox_watermark",
        "webui_backend",
        "OCR_index_strategy",
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
        if pwd is not None:
            from windrecorder.api import auth as auth_mod

            auth_mod.set_password("" if pwd == "" else str(pwd))
            applied.append("webui_access_password_hash")
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


def get_update_db_status() -> dict[str, Any]:
    return dict(_update_state)


def start_update_db(shutdown_after: bool = False) -> dict[str, Any]:
    """Start ocr_manager_main in a background thread (manual index)."""
    if config.OCR_index_strategy != 0:
        return {
            "ok": False,
            "error": "manual_update_disabled",
            "detail": "OCR_index_strategy is auto; manual update only when strategy==0",
            "job": dict(_update_state),
        }
    if not _update_lock.acquire(blocking=False):
        return {"ok": False, "error": "already_running", "job": dict(_update_state)}
    if _update_state["running"]:
        _update_lock.release()
        return {"ok": False, "error": "already_running", "job": dict(_update_state)}

    _update_state.update(
        {
            "running": True,
            "started_at": time.time(),
            "finished_at": None,
            "ok": None,
            "error": None,
            "time_cost_seconds": None,
            "shutdown_after": bool(shutdown_after),
        }
    )

    def _worker():
        t0 = time.time()
        try:
            from windrecorder import ocr_manager

            ocr_manager.ocr_manager_main()
            _update_state["ok"] = True
        except Exception as e:
            logger.exception("manual update db failed")
            _update_state["ok"] = False
            _update_state["error"] = str(e)
        finally:
            _update_state["time_cost_seconds"] = round(time.time() - t0, 3)
            _update_state["finished_at"] = time.time()
            _update_state["running"] = False
            try:
                _update_lock.release()
            except RuntimeError:
                pass
            if shutdown_after and _update_state.get("ok"):
                try:
                    import subprocess

                    subprocess.run(["shutdown", "-s", "-t", "60"], shell=True)
                except Exception as e:
                    logger.error(e)

    threading.Thread(target=_worker, name="webui-update-db", daemon=True).start()
    return {
        "ok": True,
        "started": True,
        "estimate_indexing_time": utils.estimate_indexing_time(),
        "job": dict(_update_state),
    }
