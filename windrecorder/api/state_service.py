from __future__ import annotations

import calendar
import datetime
import os
from typing import Any

import pandas as pd

from windrecorder import file_utils, state, utils, wordcloud
from windrecorder.api.oneday_service import media_file_url
from windrecorder.config import config
from windrecorder.db_manager import db_manager
from windrecorder.logger import get_logger

logger = get_logger(__name__)


def _media_file_url(path: str) -> str:
    return media_file_url(path)


def get_available_range() -> dict[str, Any]:
    earliest = int(db_manager.db_first_earliest_record_time() or 0)
    latest = int(db_manager.db_latest_record_time() or 0)
    return {
        "earliest_ts": earliest,
        "latest_ts": latest,
        "earliest_datetime": utils.seconds_to_datetime(earliest).isoformat(sep="T") if earliest else None,
        "latest_datetime": utils.seconds_to_datetime(latest).isoformat(sep="T") if latest else None,
    }


def _month_cache_path(dt: datetime.datetime) -> str:
    name = dt.strftime("%Y-%m") + "_month_data_state.csv"
    return os.path.join(config.date_state_dir_ud, name)


def _year_cache_path(dt: datetime.datetime) -> str:
    name = dt.strftime("%Y") + "_year_data_state.csv"
    return os.path.join(config.date_state_dir_ud, name)


def get_month_scatter(year: int, month: int, force: bool = False) -> dict[str, Any]:
    dt = datetime.datetime(year, month, 1, 10, 0, 0)
    path = _month_cache_path(dt)
    file_utils.ensure_dir(config.date_state_dir_ud)
    df = None
    if not force and os.path.exists(path):
        is_current = path.find(datetime.datetime.today().strftime("%Y-%m")) >= 0
        if not is_current or file_utils.is_file_modified_recently(path, time_gap=120):
            df = file_utils.read_dataframe_from_path(file_path=path)
    if df is None or (isinstance(df, pd.DataFrame) and df.empty):
        df = state.get_month_day_overview_scatter(dt)
        file_utils.save_dataframe_to_path(df, file_path=path)
    points = []
    for _, row in df.iterrows():
        points.append({"day": int(row["day"]), "hours": int(row["hours"]), "data_count": int(row["data_count"])})
    return {"year": year, "month": month, "points": points}


def get_year_scatter(year: int, force: bool = False) -> dict[str, Any]:
    dt = datetime.datetime(year, 1, 1, 10, 0, 0)
    path = _year_cache_path(dt)
    file_utils.ensure_dir(config.date_state_dir_ud)
    df = None
    if not force and os.path.exists(path) and file_utils.is_file_modified_recently(path, time_gap=3000):
        df = file_utils.read_dataframe_from_path(file_path=path)
    if df is None or (isinstance(df, pd.DataFrame) and df.empty):
        df = state.get_year_data_overview_scatter(dt)
        file_utils.save_dataframe_to_path(df, file_path=path)
    points = []
    for _, row in df.iterrows():
        points.append({"month": int(row["month"]), "day": int(row["day"]), "data_count": int(row["data_count"])})
    return {"year": year, "points": points}


def generate_lightbox(year: int, month: int) -> dict[str, Any]:
    days = calendar.monthrange(year, month)[1]
    name = f"{year}-{month}.png"
    ok = state.generate_lightbox_from_datetime_range(
        dt_month_start=datetime.datetime(year, month, 1, 0, 0, 1),
        dt_month_end=datetime.datetime(year, month, days, 23, 59, 59),
        img_saved_name=name,
    )
    path = os.path.join(config.lightbox_result_dir_ud, name)
    return {
        "ok": bool(ok) and os.path.exists(path),
        "image_url": _media_file_url(path) if os.path.exists(path) else None,
        "path": path if os.path.exists(path) else None,
    }


def generate_wordcloud(year: int, month: int) -> dict[str, Any]:
    dt = datetime.datetime(year, month, 1, 12, 0, 0)
    name = f"{year}-{month}.png"
    wordcloud.generate_word_cloud_in_month(utils.datetime_to_seconds(dt), name)
    path = os.path.join(config.wordcloud_result_dir_ud, name)
    return {
        "ok": os.path.exists(path),
        "image_url": _media_file_url(path) if os.path.exists(path) else None,
        "path": path if os.path.exists(path) else None,
    }


def get_assets(year: int, month: int) -> dict[str, Any]:
    lightbox = os.path.join(config.lightbox_result_dir_ud, f"{year}-{month}.png")
    cloud = os.path.join(config.wordcloud_result_dir_ud, f"{year}-{month}.png")
    return {
        "lightbox_url": _media_file_url(lightbox) if os.path.exists(lightbox) else None,
        "wordcloud_url": _media_file_url(cloud) if os.path.exists(cloud) else None,
    }
