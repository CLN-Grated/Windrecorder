from __future__ import annotations

import glob
import os
import threading
import time
from pathlib import Path
from typing import Any

from windrecorder import __version__, file_utils, record, utils
from windrecorder.config import config
from windrecorder.const import OCR_SUPPORT_CONFIG, SCREENSHOT_CACHE_FILEPATH
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

_clear_lock = threading.Lock()

CLEAR_SCOPE_IDS = (
    "ocr_db",
    "img_emb",
    "videos",
    "screenshot_cache",
    "result_assets",
)


def _human_size(n: int) -> str:
    size = float(max(0, int(n)))
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{int(n)} B"


def _stat_path(path: str) -> tuple[int, int]:
    """Return (file_count, byte_size) for a file or directory tree."""
    if not path or not os.path.exists(path):
        return 0, 0
    if os.path.isfile(path):
        try:
            return 1, int(os.path.getsize(path))
        except OSError:
            return 0, 0
    count = 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            fp = os.path.join(root, name)
            try:
                total += int(os.path.getsize(fp))
                count += 1
            except OSError:
                continue
    return count, total


def _collect_scope_targets(scope: str) -> list[str]:
    """Absolute paths to delete for a scope (files or top-level children of dirs)."""
    targets: list[str] = []
    if scope == "ocr_db":
        db_dir = getattr(config, "db_path_ud", None) or os.path.join(config.userdata_dir, "db")
        if os.path.isdir(db_dir):
            for pattern in ("*_wind.db", "*_TEMP_READ.db"):
                targets.extend(glob.glob(os.path.join(db_dir, pattern)))
    elif scope == "img_emb":
        emb = getattr(config, "vdb_img_path_ud", None)
        if emb and os.path.isdir(emb):
            # delete directory contents (and empty dir via deleting children first)
            for name in os.listdir(emb):
                targets.append(os.path.join(emb, name))
    elif scope == "videos":
        vid = getattr(config, "record_videos_dir_ud", None)
        if vid and os.path.isdir(vid):
            for name in os.listdir(vid):
                targets.append(os.path.join(vid, name))
    elif scope == "screenshot_cache":
        for cand in (SCREENSHOT_CACHE_FILEPATH, "cache_screenshot"):
            if not cand:
                continue
            abs_c = os.path.abspath(str(cand))
            if os.path.isdir(abs_c):
                for name in os.listdir(abs_c):
                    targets.append(os.path.join(abs_c, name))
            elif os.path.isfile(abs_c):
                targets.append(abs_c)
    elif scope == "result_assets":
        ud = os.path.abspath(config.userdata_dir)
        if os.path.isdir(ud):
            for name in os.listdir(ud):
                if name.startswith("result_"):
                    targets.append(os.path.join(ud, name))
        # also known config result dirs if outside naming
        for attr in (
            "timeline_result_dir_ud",
            "lightbox_result_dir_ud",
            "wordcloud_result_dir_ud",
            "wintitle_result_dir_ud",
            "date_state_dir_ud",
        ):
            p = getattr(config, attr, None)
            if p and os.path.exists(p) and os.path.abspath(p) not in {os.path.abspath(t) for t in targets}:
                targets.append(p)
    # never touch config
    protected = {
        os.path.abspath(os.path.join(config.userdata_dir, "config_user.json")),
        os.path.abspath(getattr(config, "flag_mark_note_filepath", "") or ""),
    }
    out = []
    seen = set()
    for t in targets:
        abs_t = os.path.abspath(t)
        if abs_t in protected or abs_t in seen:
            continue
        if not os.path.exists(abs_t):
            continue
        seen.add(abs_t)
        out.append(abs_t)
    return out


def _scope_path_hint(scope: str) -> str:
    hints = {
        "ocr_db": "userdata/db (*_wind.db)",
        "img_emb": "userdata/db_imgemb",
        "videos": "userdata/videos",
        "screenshot_cache": "cache_screenshot",
        "result_assets": "userdata/result_*",
    }
    return hints.get(scope, scope)


def get_clear_data_preview() -> dict[str, Any]:
    is_rec = bool(record.is_recording()) if hasattr(record, "is_recording") else False
    scopes: dict[str, Any] = {}
    total_files = 0
    total_bytes = 0
    for sid in CLEAR_SCOPE_IDS:
        targets = _collect_scope_targets(sid)
        file_count = 0
        byte_size = 0
        for t in targets:
            c, b = _stat_path(t)
            file_count += c
            byte_size += b
        scopes[sid] = {
            "id": sid,
            "label_key": f"webui_clear_scope_{sid}",
            "path_hint": _scope_path_hint(sid),
            "file_count": file_count,
            "byte_size": byte_size,
            "human_size": _human_size(byte_size),
            "exists": file_count > 0 or any(os.path.exists(t) for t in targets),
            "target_count": len(targets),
        }
        total_files += file_count
        total_bytes += byte_size
    return {
        # 清除本地数据一律永久删除，不进回收站、不读 recycle_deleted_files
        "permanent": True,
        "is_recording": is_rec,
        "scopes": scopes,
        "total_if_all": {
            "file_count": total_files,
            "byte_size": total_bytes,
            "human_size": _human_size(total_bytes),
        },
    }


def clear_local_data(scopes: list[str], confirm: bool = False) -> dict[str, Any]:
    if not confirm:
        return {"ok": False, "error": "confirm_required", "detail": "confirm must be true"}
    if not scopes:
        return {"ok": False, "error": "empty_scopes", "detail": "scopes is empty"}
    bad = [s for s in scopes if s not in CLEAR_SCOPE_IDS]
    if bad:
        return {"ok": False, "error": "invalid_scopes", "detail": f"unknown: {bad}"}

    is_rec = bool(record.is_recording()) if hasattr(record, "is_recording") else False
    if is_rec:
        return {
            "ok": False,
            "error": "recording",
            "detail": "请先停止录制后再清除数据",
            "status_code": 409,
        }

    if not _clear_lock.acquire(blocking=False):
        return {"ok": False, "error": "already_running", "detail": "clear already in progress"}

    deleted: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    try:
        for sid in scopes:
            for path in _collect_scope_targets(sid):
                try:
                    # 永久删除：不走 send2trash / recycle_deleted_files
                    ok, msg = file_utils.safe_delete(path)
                    still = os.path.exists(path)
                    if not ok or still:
                        failed.append({"path": path, "scope": sid, "error": msg if not ok else "still_exists"})
                    else:
                        deleted.append({"path": path, "scope": sid, "ok": True})
                except Exception as e:
                    logger.exception("clear_local_data failed for %s", path)
                    failed.append({"path": path, "scope": sid, "error": str(e)})
        return {
            "ok": len(failed) == 0,
            "deleted": deleted,
            "failed": failed,
            "permanent": True,
            "deleted_count": len(deleted),
            "failed_count": len(failed),
        }
    finally:
        try:
            _clear_lock.release()
        except RuntimeError:
            pass


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
    try:
        display_count = utils.get_display_count()
        display_info_formatted = utils.get_display_info_formatted()
    except Exception:
        display_count, display_info_formatted = 1, []

    crop = list(config.ocr_image_crop_URBL or [])
    crop = utils.ensure_list_divisible_by_num(crop, 4)
    while len(crop) < max(1, int(display_count)) * 4:
        crop.extend([6, 6, 6, 3])

    return {
        "settings": {
            "lang": "sc",
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
            "ocr_image_crop_URBL": crop,
            "wordcloud_user_stop_words": config.wordcloud_user_stop_words,
            "enable_month_lightbox_watermark": config.enable_month_lightbox_watermark,
            "enable_ocr_str_highlight_indicator": config.enable_ocr_str_highlight_indicator,
            "webui_password_enabled": bool(
                (getattr(config, "webui_access_password_hash", None) or "")
                or (getattr(config, "webui_access_password_md5", None) or "")
            ),
            "webui_backend": getattr(config, "webui_backend", "fastapi"),
            "OCR_index_strategy": config.OCR_index_strategy,
            "multi_display_record_strategy": getattr(config, "multi_display_record_strategy", "all"),
        },
        "os_support_lang": os_langs,
        "ocr_support": ocr_support,
        "db_status": get_db_status(),
        "lang_map": {"sc": "简体中文"},
        "display_count": display_count,
        "display_info_formatted": display_info_formatted,
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
        "enable_ocr_str_highlight_indicator",
        "webui_backend",
        "OCR_index_strategy",
    ]
    applied = []
    for key in mapping:
        if key in payload:
            config.set_and_save_config(key, payload[key])
            applied.append(key)
    # 多语言已移除：忽略前端传入的 lang，强制 sc
    if "lang" in payload and payload["lang"] != "sc":
        config.set_and_save_config("lang", "sc")
        applied.append("lang")
    elif config.lang != "sc":
        config.set_and_save_config("lang", "sc")
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
