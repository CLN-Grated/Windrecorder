from __future__ import annotations

import datetime
import os
from typing import Any, Optional
from urllib.parse import quote

import pandas as pd

from windrecorder import file_utils, utils
from windrecorder.config import config
from windrecorder.const import SCREENSHOT_CACHE_FILEPATH
from windrecorder.db_manager import db_manager
from windrecorder.logger import get_logger
from windrecorder.oneday import OneDay

logger = get_logger(__name__)


def parse_date(date_str: str) -> datetime.date:
    return datetime.date.fromisoformat(date_str)


def parse_datetime(dt_str: str) -> datetime.datetime:
    # Accept "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
    normalized = dt_str.replace(" ", "T")
    if normalized.endswith("Z"):
        normalized = normalized[:-1]
    return datetime.datetime.fromisoformat(normalized)


def default_day_date() -> datetime.date:
    """Mirror Streamlit oneday default date with day_begin_minutes."""
    now = datetime.datetime.now()
    day_begin = config.day_begin_minutes
    if (now - now.replace(hour=0, minute=0, second=0, microsecond=0)) < datetime.timedelta(minutes=day_begin):
        return datetime.date.today() - datetime.timedelta(days=1)
    return datetime.date.today()


def day_range_start(day: datetime.date) -> datetime.datetime:
    begin = config.day_begin_minutes
    return datetime.datetime(day.year, day.month, day.day, begin // 60, begin % 60, 0)


def _dt_iso(dt: Optional[datetime.datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.replace(microsecond=0).isoformat(sep="T")


def _dt_ts(dt: Optional[datetime.datetime]) -> Optional[int]:
    if dt is None:
        return None
    return int(utils.datetime_to_seconds(dt))


def _ts_to_dt(ts: int) -> datetime.datetime:
    return utils.seconds_to_datetime(int(ts))


def _media_video_url(filename: str) -> str:
    return f"/media/video/{quote(filename)}"


def _media_file_url(path: str) -> str:
    return f"/media/file?path={quote(path, safe='')}"


def _timeline_img_name(day: datetime.date) -> str:
    if day == datetime.date.today():
        return f"{day.strftime('%Y-%m-%d')}-today-.png"
    return f"{day.strftime('%Y-%m-%d')}.png"


def _timeline_img_path(day: datetime.date) -> str:
    return os.path.join(config.timeline_result_dir_ud, _timeline_img_name(day))


def _ensure_timeline_image(day: datetime.date, min_dt: datetime.datetime, max_dt: datetime.datetime) -> bool:
    img_name = _timeline_img_name(day)
    img_path = _timeline_img_path(day)
    file_utils.ensure_dir(config.timeline_result_dir_ud)

    need_generate = False
    if not os.path.exists(img_path):
        need_generate = True
    elif "-today-" in img_path and not file_utils.is_file_modified_recently(img_path):
        need_generate = True

    if need_generate:
        ok = OneDay().generate_preview_timeline_img(dt_in=min_dt, dt_out=max_dt, img_saved_name=img_name)
        if not ok:
            return False
        # cleanup stale today markers
        if day == datetime.date.today():
            real_today = f"{datetime.date.today().strftime('%Y-%m-%d')}-today-.png"
            for filename in os.listdir(config.timeline_result_dir_ud):
                if "-today-" in filename and filename != real_today:
                    try:
                        os.remove(os.path.join(config.timeline_result_dir_ud, filename))
                    except OSError as e:
                        logger.error(e)
    return os.path.exists(img_path)


def _row_to_public_dict(row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    data = row.to_dict() if isinstance(row, pd.Series) else dict(row)
    out: dict[str, Any] = {}
    for key, value in data.items():
        if pd.isna(value):
            out[key] = None
        elif isinstance(value, (datetime.datetime, datetime.date)):
            out[key] = value.isoformat()
        else:
            # numpy / pandas scalars
            try:
                if hasattr(value, "item"):
                    value = value.item()
            except Exception:
                pass
            out[key] = value
    return out


def get_day_meta(day: datetime.date) -> dict[str, Any]:
    dt_in = day_range_start(day)
    (
        day_has_data,
        noocred_count,
        result_count,
        min_dt,
        max_dt,
        day_df,
    ) = OneDay().checkout_daily_data_meta(dt_in)

    if day_has_data and config.record_mode == "screenshot_array" and min_dt and max_dt:
        earliest_ss, latest_ss = OneDay().find_earliest_latest_screenshots_cache_datetime_via_date(day)
        if earliest_ss and latest_ss:
            begin_floor = datetime.datetime(day.year, day.month, day.day, config.day_begin_minutes // 60, config.day_begin_minutes % 60, 0)
            if min_dt > earliest_ss and earliest_ss > begin_floor:
                min_dt = earliest_ss
            if max_dt < latest_ss:
                max_dt = latest_ss

    has_video_on_disk = False
    if not day_has_data:
        # videos/ may still hold the day even when userdata/videos is used; keep original behavior
        has_video_on_disk = bool(file_utils.find_filename_in_dir("videos", utils.datetime_to_dateDayStr(dt_in))) or bool(
            file_utils.find_filename_in_dir(config.record_videos_dir_ud, utils.datetime_to_dateDayStr(dt_in))
        )

    is_indexing = False
    if day == datetime.date.today():
        try:
            is_indexing = bool(utils.is_maintain_lock_valid())
        except OSError:
            is_indexing = False

    return {
        "date": day.isoformat(),
        "has_data": bool(day_has_data),
        "noocred_count": int(noocred_count or 0),
        "result_count": int(result_count or 0),
        "min_datetime": _dt_iso(min_dt),
        "max_datetime": _dt_iso(max_dt),
        "min_ts": _dt_ts(min_dt),
        "max_ts": _dt_ts(max_dt),
        "day_begin_minutes": config.day_begin_minutes,
        "record_mode": config.record_mode,
        "has_video_on_disk": has_video_on_disk,
        "is_indexing": bool(is_indexing),
        "enable_3_columns": bool(config.enable_3_columns_in_oneday),
        "_df": day_df,
    }


def get_day_chart(day: datetime.date) -> dict[str, Any]:
    meta = get_day_meta(day)
    points = []
    day_df = meta.get("_df")
    min_dt = parse_datetime(meta["min_datetime"]) if meta.get("min_datetime") else None
    max_dt = parse_datetime(meta["max_datetime"]) if meta.get("max_datetime") else None
    if meta["has_data"] and day_df is not None and min_dt and max_dt:
        chart_df = OneDay().get_day_statistic_chart_overview(df=day_df, start_dt=min_dt, end_dt=max_dt)
        for _, row in chart_df.iterrows():
            hour = row["hour"]
            if isinstance(hour, pd.Timestamp):
                hour_dt = hour.to_pydatetime().replace(microsecond=0)
            elif isinstance(hour, datetime.datetime):
                hour_dt = hour.replace(microsecond=0)
            else:
                hour_dt = parse_datetime(str(hour))
            points.append(
                {
                    "hour": _dt_iso(hour_dt) or str(hour),
                    "ts": int(_dt_ts(hour_dt) or 0),
                    "data": int(row["data"]),
                }
            )
    return {"date": day.isoformat(), "points": points}


def get_day_timeline(day: datetime.date) -> dict[str, Any]:
    meta = get_day_meta(day)
    if not meta["has_data"] or not meta.get("min_datetime") or not meta.get("max_datetime"):
        return {"date": day.isoformat(), "available": False, "image_url": None}

    min_dt = parse_datetime(meta["min_datetime"])
    max_dt = parse_datetime(meta["max_datetime"])
    ok = _ensure_timeline_image(day, min_dt, max_dt)
    if not ok:
        return {"date": day.isoformat(), "available": False, "image_url": None}

    img_path = _timeline_img_path(day)
    return {
        "date": day.isoformat(),
        "available": True,
        "image_url": _media_file_url(os.path.abspath(img_path)),
    }


def locate_datetime(target_dt: datetime.datetime) -> dict[str, Any]:
    day = target_dt.date()
    # Adjust for day_begin crossing midnight: still use calendar date of target
    meta = get_day_meta(day)
    day_df = meta.get("_df")
    target_ts = int(utils.datetime_to_seconds(target_dt))

    def _base(**kwargs):
        payload = {
            "datetime": _dt_iso(target_dt),
            "ts": target_ts,
        }
        payload.update(kwargs)
        return payload

    if not meta["has_data"] or day_df is None:
        if meta.get("is_indexing"):
            return _base(kind="indexing", message="data_indexing")
        return _base(kind="empty", message="no_data")

    # 1) nearest video on disk
    found, video_name = OneDay().find_closest_video_by_filesys(target_dt)
    if found and video_name:
        resolved = file_utils.check_video_exist_in_videos_dir(video_name) or video_name
        vid_ts = utils.calc_vid_name_to_timestamp(resolved)
        select_ts = utils.datetime_to_seconds(target_dt)
        start = int(select_ts - vid_ts) if vid_ts is not None else 0
        if start < 0:
            start = 0
        deep_linking = _deep_linking_by_datetime(target_dt)
        return _base(
            kind="video",
            video_filename=resolved,
            video_url=_media_video_url(resolved),
            start_seconds=start,
            deep_linking=deep_linking,
        )

    # 2) screenshot cache folder name match
    found_ss, ss_path = OneDay().find_closest_video_by_filesys(
        target_dt,
        threshold=20,
        dir_path=SCREENSHOT_CACHE_FILEPATH,
        return_as_full_filepath=True,
    )
    if found_ss and ss_path and os.path.exists(ss_path):
        return _base(
            kind="screenshot",
            screenshot_url=_media_file_url(os.path.abspath(ss_path)),
            deep_linking=_deep_linking_from_screenshot(ss_path),
        )

    # 3) database nearest row
    is_data_found, found_row = OneDay().find_closest_video_by_database(day_df, utils.datetime_to_seconds(target_dt))
    if is_data_found and found_row is not None and len(found_row) > 0:
        row0 = found_row.iloc[0]
        picture = row0.get("picturefile_name") if hasattr(row0, "get") else found_row["picturefile_name"].iloc[0]
        if isinstance(picture, str) and os.path.exists(picture):
            return _base(
                kind="screenshot",
                screenshot_url=_media_file_url(os.path.abspath(picture)),
                deep_linking=row0.get("deep_linking") if hasattr(row0, "get") else None,
                row=_row_to_public_dict(row0),
            )

        df_vid_filename = file_utils.check_video_exist_in_videos_dir(found_row["videofile_name"].iloc[0])
        if df_vid_filename:
            df_vid_filepath = file_utils.convert_vid_filename_as_vid_filepath(df_vid_filename)
            if os.path.exists(df_vid_filepath):
                vidfile_timestamp = utils.calc_vid_name_to_timestamp(df_vid_filename)
                select_timestamp = utils.datetime_to_seconds(target_dt)
                shown_timestamp = int(select_timestamp - vidfile_timestamp) if vidfile_timestamp is not None else 0
                if shown_timestamp >= 0:
                    return _base(
                        kind="video",
                        video_filename=df_vid_filename,
                        video_url=_media_video_url(df_vid_filename),
                        start_seconds=shown_timestamp,
                        deep_linking=row0.get("deep_linking") if hasattr(row0, "get") else None,
                        row=_row_to_public_dict(row0),
                    )

        return _base(
            kind="row",
            row=_row_to_public_dict(row0),
            message="not_found_vid_but_has_data",
            deep_linking=row0.get("deep_linking") if hasattr(row0, "get") else None,
        )

    if meta.get("is_indexing"):
        return _base(kind="indexing", message="data_indexing")
    return _base(kind="empty", message="no_found_record_and_vid_on_disk")


def search_day(day: datetime.date, query: str) -> dict[str, Any]:
    df = OneDay().search_day_data(utils.complete_datetime(day), search_content=query or "")
    hits = []
    if df is not None and not df.empty:
        for idx, row in df.reset_index(drop=True).iterrows():
            vname = row.get("videofile_name")
            on_disk = bool(file_utils.check_video_exist_in_videos_dir(str(vname))) if vname is not None and str(vname) != "nan" else False
            ts = int(row.get("videofile_time") or 0)
            hits.append(
                {
                    "index": int(idx),
                    "videofile_time": ts,
                    "datetime": _dt_iso(utils.seconds_to_datetime(ts)),
                    "ts": ts,
                    "videofile_name": None if pd.isna(vname) else str(vname),
                    "win_title": None if pd.isna(row.get("win_title")) else str(row.get("win_title")),
                    "ocr_text": None if pd.isna(row.get("ocr_text")) else str(row.get("ocr_text"))[:500],
                    "deep_linking": None if pd.isna(row.get("deep_linking")) else str(row.get("deep_linking")),
                    "thumbnail": None if pd.isna(row.get("thumbnail")) else str(row.get("thumbnail")),
                    "video_on_disk": on_disk,
                }
            )
    return {"date": day.isoformat(), "query": query or "", "total": len(hits), "hits": hits}


def get_wintitle_stat(day: datetime.date) -> dict[str, Any]:
    df_show = OneDay().get_wintitle_stat_in_day(day_range_start(day))
    items = []
    if df_show is not None and not df_show.empty:
        for _, row in df_show.iterrows():
            items.append({"page": str(row["Page"]), "screen_time": str(row["Screen Time"])})
    return {"date": day.isoformat(), "items": items}


def resolve_video_path(filename: str) -> Optional[str]:
    """Resolve a video basename to an absolute path under videos dir."""
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename.replace("\\", "/").split("/")[-1]:
        return None
    # Prefer check helper (handles -OCRED suffix variants)
    resolved = file_utils.check_video_exist_in_videos_dir(safe_name) or safe_name
    path = file_utils.convert_vid_filename_as_vid_filepath(resolved)
    path = os.path.abspath(path)
    videos_root = os.path.abspath(config.record_videos_dir_ud)
    if not path.startswith(videos_root):
        return None
    if not os.path.isfile(path):
        return None
    return path


def resolve_allowed_file_path(path: str) -> Optional[str]:
    """Allow reading files only under known project data directories."""
    if not path:
        return None
    abs_path = os.path.abspath(path)
    if not os.path.isfile(abs_path):
        return None

    allowed_roots = [
        os.path.abspath(config.record_videos_dir_ud),
        os.path.abspath(config.timeline_result_dir_ud),
        os.path.abspath(config.lightbox_result_dir_ud),
        os.path.abspath(config.wordcloud_result_dir_ud),
        os.path.abspath(config.wintitle_result_dir_ud),
        os.path.abspath(config.userdata_dir),
        os.path.abspath(SCREENSHOT_CACHE_FILEPATH),
        os.path.abspath("cache_screenshot"),
        os.path.abspath("cache"),
        os.path.abspath("__assets__"),
    ]
    for root in allowed_roots:
        try:
            if os.path.commonpath([abs_path, root]) == root:
                return abs_path
        except ValueError:
            continue
    return None


def _deep_linking_by_datetime(dt: datetime.datetime) -> Optional[str]:
    if not config.record_deep_linking:
        return None
    try:
        df_row = db_manager.db_get_closest_row_around_by_datetime(dt=dt, time_threshold=30)
        if df_row is None or df_row.empty:
            return None
        val = df_row.loc[df_row.first_valid_index(), "deep_linking"]
        if pd.isna(val) or not val:
            return None
        return str(val)
    except Exception as e:
        logger.debug(e)
        return None


def _deep_linking_from_screenshot(screenshot_filepath: str) -> Optional[str]:
    if not config.record_deep_linking:
        return None
    try:
        from windrecorder.const import SCREENSHOT_CACHE_FILEPATH_TMP_DB_NAME

        json_path = os.path.join(os.path.dirname(screenshot_filepath), SCREENSHOT_CACHE_FILEPATH_TMP_DB_NAME)
        if not os.path.exists(json_path):
            return None
        tmp_db_json = file_utils.read_json_as_dict_from_path(json_path)
        sec = utils.dtstr_to_seconds(os.path.basename(screenshot_filepath)[:19])
        threshold_sec = 10
        for v in tmp_db_json.get("data", []):
            if -2 <= sec - v["videofile_time"] <= threshold_sec:
                return v.get("deep_linking") or None
    except Exception as e:
        logger.debug(e)
    return None
