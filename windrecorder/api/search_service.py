from __future__ import annotations

import datetime
import time
from typing import Any, Optional
from urllib.parse import quote

import pandas as pd

from windrecorder import file_utils, utils
from windrecorder.config import config
from windrecorder.db_manager import db_manager
from windrecorder.logger import get_logger

logger = get_logger(__name__)

_emb_cache: dict[str, Any] = {}


def _dt_iso(dt: Optional[datetime.datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.replace(microsecond=0).isoformat(sep="T")


def _media_video_url(filename: str) -> str:
    return f"/media/video/{quote(filename)}"


def get_search_bounds() -> dict[str, Any]:
    latest = int(db_manager.db_latest_record_time() or 0)
    earliest = int(db_manager.db_first_earliest_record_time() or 0)
    return {
        "earliest_ts": earliest,
        "latest_ts": latest,
        "earliest_datetime": _dt_iso(utils.seconds_to_datetime(earliest)) if earliest else None,
        "latest_datetime": _dt_iso(utils.seconds_to_datetime(latest)) if latest else None,
        "max_page_result": int(config.max_page_result),
        "enable_img_embed": bool(config.enable_img_embed_search and config.img_embed_module_install),
        "enable_synonyms": bool(config.enable_synonyms_recommend),
        "img_embed_module_install": bool(config.img_embed_module_install),
    }


def _normalize_range(date_in: datetime.datetime, date_out: datetime.datetime) -> tuple[datetime.datetime, datetime.datetime]:
    start = utils.get_datetime_in_day_range_pole_by_config_day_begin(date_in, range="start")
    end = utils.get_datetime_in_day_range_pole_by_config_day_begin(date_out, range="end")
    return start, end


def _df_page_payload(df: pd.DataFrame, page_index: int, all_count: int, max_page: int, time_cost: float) -> dict[str, Any]:
    page_df = db_manager.db_search_data_page_turner(df, page_index) if df is not None and not df.empty else pd.DataFrame()
    cache_list = file_utils.get_file_path_list(config.record_videos_dir_ud)
    if page_df is not None and not page_df.empty:
        try:
            page_df = db_manager.db_refine_search_data_global(page_df, cache_videofile_ondisk_list=cache_list)
        except Exception as e:
            logger.debug(e)

    hits = []
    if page_df is not None and not page_df.empty:
        for i, (_, row) in enumerate(page_df.reset_index(drop=True).iterrows()):
            vname = row.get("videofile_name")
            on_disk_name = file_utils.check_video_exist_in_videos_dir(str(vname)) if vname is not None and str(vname) != "nan" else None
            ts = int(row.get("videofile_time") or 0)
            start_seconds = None
            video_url = None
            if on_disk_name:
                try:
                    start_seconds = int(utils.calc_vid_inside_time(page_df.reset_index(drop=True), i))
                except Exception:
                    start_seconds = 0
                video_url = _media_video_url(on_disk_name)

            thumb = row.get("thumbnail")
            ocr = row.get("ocr_text")
            hits.append(
                {
                    "index": i,
                    "videofile_time": ts,
                    "datetime": _dt_iso(utils.seconds_to_datetime(ts)),
                    "ts": ts,
                    "videofile_name": None if pd.isna(vname) else str(vname),
                    "win_title": None if pd.isna(row.get("win_title")) else str(row.get("win_title")),
                    "ocr_text": None if pd.isna(ocr) else str(ocr)[:800],
                    "deep_linking": None if pd.isna(row.get("deep_linking")) else str(row.get("deep_linking")),
                    "thumbnail": None if pd.isna(thumb) else str(thumb),
                    "video_on_disk": bool(on_disk_name),
                    "video_url": video_url,
                    "start_seconds": start_seconds,
                }
            )

    return {
        "total": int(all_count or 0),
        "max_page": int(max_page or 1),
        "page_index": int(page_index),
        "time_cost": float(time_cost),
        "hits": hits,
    }


def search_ocr(
    keyword: str,
    date_in: datetime.datetime,
    date_out: datetime.datetime,
    exclude: str = "",
    page_index: int = 1,
) -> dict[str, Any]:
    start, end = _normalize_range(date_in, date_out)
    t0 = time.time()
    df, all_count, max_page = db_manager.db_search_data(keyword or "", start, end, keyword_input_exclude=exclude or "")
    cost = round(time.time() - t0, 5)
    payload = _df_page_payload(df if df is not None else pd.DataFrame(), page_index, all_count, max_page, cost)
    payload.update(
        {
            "query": keyword or "",
            "exclude": exclude or "",
            "date_in": _dt_iso(start),
            "date_out": _dt_iso(end),
            "mode": "ocr",
        }
    )
    return payload


def _ensure_emb_models():
    if not (config.enable_img_embed_search and config.img_embed_module_install):
        raise RuntimeError("img_embed_not_available")
    if "model_text" in _emb_cache:
        return _emb_cache
    try:
        from windrecorder import img_embed_manager
    except ModuleNotFoundError as e:
        config.set_and_save_config("img_embed_module_install", False)
        raise RuntimeError("img_embed_not_installed") from e

    model_text, model_image, processor_text, processor_image = img_embed_manager.get_model_and_processor()
    _emb_cache.update(
        {
            "model_text": model_text,
            "model_image": model_image,
            "processor_text": processor_text,
            "processor_image": processor_image,
            "mgr": img_embed_manager,
        }
    )
    return _emb_cache


def search_img_text(
    query: str,
    date_in: datetime.datetime,
    date_out: datetime.datetime,
    page_index: int = 1,
) -> dict[str, Any]:
    emb = _ensure_emb_models()
    t0 = time.time()
    vector = emb["mgr"].embed_text(
        model_text=emb["model_text"],
        processor_text=emb["processor_text"],
        text_query=query,
    )
    df, all_count, max_page = emb["mgr"].query_vector_in_img_vdbs(
        vector=vector,
        start_datetime=date_in,
        end_datetime=date_out,
    )
    cost = round(time.time() - t0, 5)
    payload = _df_page_payload(df if df is not None else pd.DataFrame(), page_index, all_count, max_page, cost)
    payload.update({"query": query, "date_in": _dt_iso(date_in), "date_out": _dt_iso(date_out), "mode": "img_text"})
    return payload


def search_img_similar(
    image_path: str,
    date_in: datetime.datetime,
    date_out: datetime.datetime,
    page_index: int = 1,
) -> dict[str, Any]:
    emb = _ensure_emb_models()
    t0 = time.time()
    vector = emb["mgr"].embed_img(
        model_image=emb["model_image"],
        processor_image=emb["processor_image"],
        img_filepath=image_path,
    )
    df, all_count, max_page = emb["mgr"].query_vector_in_img_vdbs(
        vector=vector,
        start_datetime=date_in,
        end_datetime=date_out,
    )
    cost = round(time.time() - t0, 5)
    payload = _df_page_payload(df if df is not None else pd.DataFrame(), page_index, all_count, max_page, cost)
    payload.update({"query": "img", "date_in": _dt_iso(date_in), "date_out": _dt_iso(date_out), "mode": "img_similar"})
    return payload


def parse_iso_dt(value: str) -> datetime.datetime:
    normalized = value.replace(" ", "T")
    if normalized.endswith("Z"):
        normalized = normalized[:-1]
    return datetime.datetime.fromisoformat(normalized)
