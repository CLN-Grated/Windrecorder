from __future__ import annotations

import datetime
import os
from typing import Any, Optional

import pandas as pd

from windrecorder import file_utils, flag_mark_note, utils
from windrecorder.config import config
from windrecorder.db_manager import db_manager
from windrecorder.logger import get_logger

logger = get_logger(__name__)


def _dt_str(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _parse_dt(value: str | datetime.datetime) -> datetime.datetime:
    if isinstance(value, datetime.datetime):
        return value.replace(microsecond=0)
    s = str(value).strip().replace("T", " ")
    if s.endswith("Z"):
        s = s[:-1]
    # accept "YYYY-MM-DD HH:MM:SS" or ISO with seconds
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.datetime.strptime(s[:19] if len(s) >= 19 else s, fmt)
        except ValueError:
            continue
    return datetime.datetime.fromisoformat(s.replace(" ", "T")).replace(microsecond=0)


def _load_df() -> pd.DataFrame:
    flag_mark_note.ensure_flag_mark_note_csv_exist()
    df = file_utils.read_dataframe_from_path(config.flag_mark_note_filepath)
    if df is None or not isinstance(df, pd.DataFrame):
        return flag_mark_note.CSV_TEMPLATE_DF.copy()
    for col in ("thumbnail", "datetime", "note"):
        if col not in df.columns:
            df[col] = ""
    return df


def _save_df(df: pd.DataFrame) -> None:
    file_utils.save_dataframe_to_path(df, config.flag_mark_note_filepath)


def _row_to_item(idx: int, row: pd.Series) -> dict[str, Any]:
    thumb = row.get("thumbnail")
    if thumb is None or (isinstance(thumb, float) and pd.isna(thumb)):
        thumb = ""
    note = row.get("note")
    if note is None or (isinstance(note, float) and pd.isna(note)):
        note = "_"
    dt_raw = row.get("datetime")
    dt_s = "" if dt_raw is None or (isinstance(dt_raw, float) and pd.isna(dt_raw)) else str(dt_raw)
    return {
        "index": int(idx),
        "datetime": dt_s,
        "note": str(note) if str(note) else "_",
        "thumbnail": str(thumb) if thumb else "",
    }


def list_flags(date: Optional[str] = None) -> dict[str, Any]:
    """List flag marks; optional date filter YYYY-MM-DD."""
    if not os.path.exists(config.flag_mark_note_filepath):
        return {"items": [], "total": 0}
    df = _load_df()
    if len(df) == 0:
        return {"items": [], "total": 0}
    items = []
    for idx, row in df.iterrows():
        item = _row_to_item(int(idx) if isinstance(idx, (int, float)) else 0, row)
        # re-index by position for stable API ids
        items.append(item)
    # use positional index for API stability
    items = []
    for pos in range(len(df)):
        row = df.iloc[pos]
        item = _row_to_item(pos, row)
        if date:
            if not str(item["datetime"]).startswith(date):
                continue
        items.append(item)
    # newest first (match Streamlit display reverse)
    items = list(reversed(items))
    return {"items": items, "total": len(items)}


def add_flag_at_datetime(datetime_str: str, note: Optional[str] = None) -> dict[str, Any]:
    """Add flag at given wall-clock datetime (from Oneday locate)."""
    dt = _parse_dt(datetime_str)
    flag_mark_note.ensure_flag_mark_note_csv_exist()
    row = db_manager.db_get_closest_row_around_by_datetime(dt)
    if note is None or note == "":
        if row is not None and not getattr(row, "empty", True):
            try:
                note = str(row["win_title"].values[0]) if "win_title" in row else "_"
            except Exception:
                note = "_"
        else:
            note = "_"
    thumb = ""
    if row is not None and not getattr(row, "empty", True):
        try:
            thumb = "" if row.empty else str(row["thumbnail"].values[0])
        except Exception:
            thumb = ""
    new_data = {
        "thumbnail": thumb,
        "datetime": _dt_str(dt),
        "note": note or "_",
    }
    df = _load_df()
    df.loc[len(df)] = new_data
    _save_df(df)
    return {"ok": True, "item": {"index": len(df) - 1, **new_data}}


def update_flag_note(datetime_str: str, note: str) -> dict[str, Any]:
    dt = _parse_dt(datetime_str)
    flag_mark_note.update_note_to_csv_by_datetime(note or "_", dt)
    return {"ok": True, "datetime": _dt_str(dt), "note": note or "_"}


def delete_flag(datetime_str: str) -> dict[str, Any]:
    dt_key = _dt_str(_parse_dt(datetime_str))
    df = _load_df()
    if len(df) == 0:
        return {"ok": False, "error": "empty"}
    before = len(df)
    df = df[df["datetime"].astype(str) != dt_key]
    if len(df) == before:
        # try partial match
        df = _load_df()
        df = df[~df["datetime"].astype(str).str.startswith(dt_key)]
    _save_df(df.reset_index(drop=True))
    if len(df) == 0 and os.path.exists(config.flag_mark_note_filepath):
        try:
            from send2trash import send2trash

            send2trash(config.flag_mark_note_filepath)
        except Exception:
            try:
                os.remove(config.flag_mark_note_filepath)
            except OSError:
                pass
    return {"ok": True, "deleted": dt_key}


def maybe_flag_timeline_url(day: datetime.date, base_img_path: str) -> Optional[str]:
    """If flags exist for day, paint them on timeline thumbnail and return abs path."""
    if not os.path.exists(config.flag_mark_note_filepath):
        return None
    if not os.path.isfile(base_img_path):
        return None
    try:
        df = file_utils.read_dataframe_from_path(config.flag_mark_note_filepath)
        if df is None or len(df) == 0:
            return None
        out = flag_mark_note.add_visual_mark_on_oneday_timeline_thumbnail(df=df, image_filepath=base_img_path)
        return out
    except Exception:
        logger.exception("flag timeline paint failed")
        return None
