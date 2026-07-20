from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True
    version: str
    lang: str
    webui_backend: str = "fastapi"


class DayMetaResponse(BaseModel):
    date: str
    has_data: bool
    noocred_count: int = 0
    result_count: int = 0
    min_datetime: Optional[str] = None
    max_datetime: Optional[str] = None
    min_ts: Optional[int] = None
    max_ts: Optional[int] = None
    day_begin_minutes: int = 0
    record_mode: str = "screenshot_array"
    has_video_on_disk: bool = False
    is_indexing: bool = False
    enable_3_columns: bool = False


class ChartPoint(BaseModel):
    hour: str
    ts: int
    data: int


class DayChartResponse(BaseModel):
    date: str
    points: list[ChartPoint] = Field(default_factory=list)


class TimelineResponse(BaseModel):
    date: str
    available: bool
    image_url: Optional[str] = None


class LocateResponse(BaseModel):
    kind: Literal["video", "screenshot", "row", "empty", "indexing"]
    datetime: str
    ts: int
    video_filename: Optional[str] = None
    video_url: Optional[str] = None
    start_seconds: Optional[int] = None
    screenshot_url: Optional[str] = None
    deep_linking: Optional[str] = None
    row: Optional[dict[str, Any]] = None
    message: Optional[str] = None


class SearchHit(BaseModel):
    index: int
    videofile_time: int
    datetime: str
    ts: int
    videofile_name: Optional[str] = None
    win_title: Optional[str] = None
    ocr_text: Optional[str] = None
    deep_linking: Optional[str] = None
    thumbnail: Optional[str] = None
    video_on_disk: bool = False


class DaySearchResponse(BaseModel):
    date: str
    query: str
    total: int
    hits: list[SearchHit] = Field(default_factory=list)


class WintitleItem(BaseModel):
    page: str
    screen_time: str


class WintitleResponse(BaseModel):
    date: str
    items: list[WintitleItem] = Field(default_factory=list)
    screentime_sum_seconds: int = 0
    screentime_sum: str = "0s"
