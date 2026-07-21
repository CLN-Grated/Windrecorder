from __future__ import annotations

import threading
import time
from typing import Any

from windrecorder import record, utils
from windrecorder.config import CONFIG_RECORD_PRESET, CONFIG_VIDEO_COMPRESS_PRESET, config

_benchmark_lock = threading.Lock()
_benchmark_state: dict[str, Any] = {
    "running": False,
    "kind": None,  # "record" | "compress"
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "error": None,
    "time_cost_seconds": None,
    "result": None,
}


def start_benchmark(kind: str) -> dict[str, Any]:
    """Start encode benchmark in background thread.

    kind: 'record' (录制预设) or 'compress' (压缩预设)
    """
    if kind not in ("record", "compress"):
        return {"ok": False, "error": "invalid_kind", "detail": "kind must be record|compress"}
    if not _benchmark_lock.acquire(blocking=False):
        return {"ok": False, "error": "already_running", "job": dict(_benchmark_state)}
    if _benchmark_state["running"]:
        try:
            _benchmark_lock.release()
        except RuntimeError:
            pass
        return {"ok": False, "error": "already_running", "job": dict(_benchmark_state)}

    _benchmark_state.update(
        {
            "running": True,
            "kind": kind,
            "started_at": time.time(),
            "finished_at": None,
            "ok": None,
            "error": None,
            "time_cost_seconds": None,
            "result": None,
        }
    )

    def _worker():
        t0 = time.time()
        try:
            if kind == "record":
                df = record.record_encode_preset_benchmark_test()
            else:
                df = record.encode_preset_benchmark_test(
                    scale_factor=config.video_compress_rate,
                    crf=config.compress_quality,
                    cpu_threads=getattr(config, "compress_cpu_threads", None),
                )
            if df is None:
                _benchmark_state["ok"] = False
                _benchmark_state["error"] = "benchmark_returned_none"
                _benchmark_state["result"] = []
            else:
                # normalize to list of dict, stringifying values for JSON
                records = []
                for _, row in df.iterrows():
                    records.append({str(k): _jsonable(v) for k, v in row.items()})
                _benchmark_state["ok"] = True
                _benchmark_state["result"] = records
        except Exception as e:
            _benchmark_state["ok"] = False
            _benchmark_state["error"] = str(e)
        finally:
            _benchmark_state["time_cost_seconds"] = round(time.time() - t0, 3)
            _benchmark_state["finished_at"] = time.time()
            _benchmark_state["running"] = False
            try:
                _benchmark_lock.release()
            except RuntimeError:
                pass

    threading.Thread(target=_worker, name="webui-encode-benchmark", daemon=True).start()
    return {"ok": True, "started": True, "kind": kind, "job": dict(_benchmark_state)}


def _jsonable(v: Any) -> Any:
    import math

    if isinstance(v, float):
        if math.isnan(v):
            return None
        return v
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return v


def get_benchmark_status() -> dict[str, Any]:
    return dict(_benchmark_state)



def get_options() -> dict[str, Any]:
    try:
        display_count = utils.get_display_count()
        display_info = utils.get_display_info()
        display_info_formatted = utils.get_display_info_formatted()
    except Exception:
        display_count, display_info, display_info_formatted = 1, [], []

    return {
        "settings": {
            "start_recording_on_startup": config.start_recording_on_startup,
            "startup_shortcut": utils.is_file_already_in_startup("start_app.bat.lnk"),
            "record_mode": config.record_mode,
            "screenshot_interval_second": config.screenshot_interval_second,
            "record_screenshot_method_capture_foreground_window_only": config.record_screenshot_method_capture_foreground_window_only,
            "convert_screenshots_to_vid_energy_saving_mode": config.convert_screenshots_to_vid_energy_saving_mode,
            "is_record_system_sound": config.is_record_system_sound,
            "record_deep_linking": config.record_deep_linking,
            "screentime_not_change_to_pause_record": config.screentime_not_change_to_pause_record,
            "OCR_index_strategy": config.OCR_index_strategy,
            "exclude_words": config.exclude_words,
            "record_encoder": config.record_encoder,
            "record_bitrate": config.record_bitrate,
            "vid_store_day": config.vid_store_day,
            "vid_compress_day": config.vid_compress_day,
            "video_compress_rate": config.video_compress_rate,
            "compress_encoder": config.compress_encoder,
            "compress_accelerator": config.compress_accelerator,
            "compress_quality": config.compress_quality,
            "compress_cpu_threads": config.compress_cpu_threads,
            "multi_display_record_strategy": config.multi_display_record_strategy,
            "record_single_display_index": config.record_single_display_index,
        },
        "display_count": display_count,
        "display_info": display_info,
        "display_info_formatted": display_info_formatted,
        "record_encoders": list(CONFIG_RECORD_PRESET.keys()),
        "compress_encoders": list(CONFIG_VIDEO_COMPRESS_PRESET.keys()),
        "compress_accelerators": {
            enc: list(acc.keys()) for enc, acc in CONFIG_VIDEO_COMPRESS_PRESET.items()
        },
    }


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    """Apply a subset of recording settings from JSON body."""
    mapping = [
        "start_recording_on_startup",
        "record_mode",
        "screenshot_interval_second",
        "record_screenshot_method_capture_foreground_window_only",
        "convert_screenshots_to_vid_energy_saving_mode",
        "is_record_system_sound",
        "record_deep_linking",
        "screentime_not_change_to_pause_record",
        "OCR_index_strategy",
        "exclude_words",
        "record_encoder",
        "record_bitrate",
        "vid_store_day",
        "vid_compress_day",
        "video_compress_rate",
        "compress_encoder",
        "compress_accelerator",
        "compress_quality",
        "compress_cpu_threads",
        "multi_display_record_strategy",
        "record_single_display_index",
    ]
    applied = []
    for key in mapping:
        if key in payload:
            config.set_and_save_config(key, payload[key])
            applied.append(key)
    if "startup_shortcut" in payload:
        utils.change_startup_shortcut(is_create=bool(payload["startup_shortcut"]))
        applied.append("startup_shortcut")
    return {"ok": True, "applied": applied}
