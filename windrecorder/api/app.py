from __future__ import annotations

import mimetypes
import os
from pathlib import Path

import tempfile

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from windrecorder import __version__
from windrecorder.api import (
    config_service,
    i18n_service,
    lab_service,
    oneday_service,
    recording_service,
    search_service,
    setting_service,
    state_service,
)
from windrecorder.api.schemas import (
    DayChartResponse,
    DayMetaResponse,
    DaySearchResponse,
    HealthResponse,
    LocateResponse,
    TimelineResponse,
    WintitleResponse,
)
from windrecorder.config import config
from windrecorder.logger import get_logger

logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def create_app() -> FastAPI:
    app = FastAPI(title="Windrecorder Web API", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthResponse)
    def health():
        return HealthResponse(
            ok=True,
            version=__version__,
            lang=config.lang,
            webui_backend=getattr(config, "webui_backend", "fastapi"),
        )

    @app.get("/api/i18n")
    def api_i18n(lang: str | None = Query(None, description="Override language code")):
        return i18n_service.get_messages(lang)

    @app.get("/api/config/public")
    def api_config_public():
        return config_service.get_public_config()

    @app.get("/api/footer")
    def api_footer():
        return config_service.get_footer_state()

    @app.get("/api/oneday/default-date")
    def oneday_default_date():
        return {"date": oneday_service.default_day_date().isoformat()}

    @app.get("/api/oneday/meta", response_model=DayMetaResponse)
    def oneday_meta(date: str = Query(..., description="YYYY-MM-DD")):
        try:
            day = oneday_service.parse_date(date)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        meta = oneday_service.get_day_meta(day)
        meta.pop("_df", None)
        return DayMetaResponse(**meta)

    @app.get("/api/oneday/chart", response_model=DayChartResponse)
    def oneday_chart(date: str = Query(..., description="YYYY-MM-DD")):
        try:
            day = oneday_service.parse_date(date)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        return DayChartResponse(**oneday_service.get_day_chart(day))

    @app.get("/api/oneday/timeline", response_model=TimelineResponse)
    def oneday_timeline(date: str = Query(..., description="YYYY-MM-DD")):
        try:
            day = oneday_service.parse_date(date)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        return TimelineResponse(**oneday_service.get_day_timeline(day))

    @app.get("/api/oneday/locate", response_model=LocateResponse)
    def oneday_locate(
        datetime: str | None = Query(None, description="ISO datetime"),
        ts: int | None = Query(None, description="Unix-like seconds used by Windrecorder DB"),
    ):
        if ts is not None:
            dt = oneday_service._ts_to_dt(ts)
        elif datetime:
            try:
                dt = oneday_service.parse_datetime(datetime)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"invalid datetime: {e}") from e
        else:
            raise HTTPException(status_code=400, detail="ts or datetime required")
        return LocateResponse(**oneday_service.locate_datetime(dt))

    @app.get("/api/oneday/search", response_model=DaySearchResponse)
    def oneday_search(
        date: str = Query(..., description="YYYY-MM-DD"),
        q: str = Query("", description="OCR keyword"),
    ):
        try:
            day = oneday_service.parse_date(date)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        return DaySearchResponse(**oneday_service.search_day(day, q))

    @app.get("/api/oneday/wintitle", response_model=WintitleResponse)
    def oneday_wintitle(date: str = Query(..., description="YYYY-MM-DD")):
        try:
            day = oneday_service.parse_date(date)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        return WintitleResponse(**oneday_service.get_wintitle_stat(day))

    # ----- Global Search -----
    @app.get("/api/search/bounds")
    def search_bounds():
        return search_service.get_search_bounds()

    @app.post("/api/search/ocr")
    def search_ocr(
        keyword: str = Form(""),
        exclude: str = Form(""),
        date_in: str = Form(...),
        date_out: str = Form(...),
        page_index: int = Form(1),
    ):
        try:
            din = search_service.parse_iso_dt(date_in)
            dout = search_service.parse_iso_dt(date_out)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        return search_service.search_ocr(keyword, din, dout, exclude=exclude, page_index=max(1, page_index))

    @app.post("/api/search/img-text")
    def search_img_text(
        query: str = Form(...),
        date_in: str = Form(...),
        date_out: str = Form(...),
        page_index: int = Form(1),
    ):
        try:
            din = search_service.parse_iso_dt(date_in)
            dout = search_service.parse_iso_dt(date_out)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        try:
            return search_service.search_img_text(query, din, dout, page_index=max(1, page_index))
        except RuntimeError as e:
            raise HTTPException(status_code=501, detail=str(e)) from e

    @app.post("/api/search/img-similar")
    async def search_img_similar(
        date_in: str = Form(...),
        date_out: str = Form(...),
        page_index: int = Form(1),
        file: UploadFile = File(...),
    ):
        try:
            din = search_service.parse_iso_dt(date_in)
            dout = search_service.parse_iso_dt(date_out)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid date: {e}") from e
        suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name
            return search_service.search_img_similar(tmp_path, din, dout, page_index=max(1, page_index))
        except RuntimeError as e:
            raise HTTPException(status_code=501, detail=str(e)) from e
        finally:
            try:
                if "tmp_path" in locals() and os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass

    # ----- State / Summary -----
    @app.get("/api/state/range")
    def state_range():
        return state_service.get_available_range()

    @app.get("/api/state/month-scatter")
    def state_month_scatter(year: int = Query(...), month: int = Query(...), force: bool = Query(False)):
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="invalid month")
        return state_service.get_month_scatter(year, month, force=force)

    @app.get("/api/state/year-scatter")
    def state_year_scatter(year: int = Query(...), force: bool = Query(False)):
        return state_service.get_year_scatter(year, force=force)

    @app.get("/api/state/assets")
    def state_assets(year: int = Query(...), month: int = Query(...)):
        return state_service.get_assets(year, month)

    @app.post("/api/state/lightbox")
    def state_lightbox(year: int = Form(...), month: int = Form(...)):
        return state_service.generate_lightbox(year, month)

    @app.post("/api/state/wordcloud")
    def state_wordcloud(year: int = Form(...), month: int = Form(...)):
        return state_service.generate_wordcloud(year, month)

    # ----- Recording / Setting / Lab -----
    @app.get("/api/recording/options")
    def recording_options():
        return recording_service.get_options()

    @app.post("/api/recording/save")
    def recording_save(payload: dict):
        return recording_service.save_settings(payload)

    @app.get("/api/setting/options")
    def setting_options():
        return setting_service.get_options()

    @app.post("/api/setting/save")
    def setting_save(payload: dict):
        return setting_service.save_settings(payload)

    @app.get("/api/setting/db-status")
    def setting_db_status():
        return setting_service.get_db_status()

    @app.get("/api/setting/about")
    def setting_about():
        return setting_service.get_about()

    @app.get("/api/lab/settings")
    def lab_settings_get():
        return lab_service.get_settings()

    @app.post("/api/lab/settings")
    def lab_settings_save(payload: dict):
        return lab_service.save_settings(payload)

    @app.post("/api/lab/test-llm")
    def lab_test_llm(
        open_ai_base_url: str | None = Form(None),
        open_ai_api_key: str | None = Form(None),
        open_ai_modelname: str | None = Form(None),
    ):
        return lab_service.test_llm(open_ai_base_url, open_ai_api_key, open_ai_modelname)

    @app.get("/media/video/{filename}")
    def media_video(filename: str):
        path = oneday_service.resolve_video_path(filename)
        if not path:
            raise HTTPException(status_code=404, detail="video not found")
        media_type = mimetypes.guess_type(path)[0] or "video/mp4"
        return FileResponse(path, media_type=media_type, filename=os.path.basename(path))

    @app.get("/media/file")
    def media_file(path: str = Query(...)):
        resolved = oneday_service.resolve_allowed_file_path(path)
        if not resolved:
            raise HTTPException(status_code=404, detail="file not found or not allowed")
        media_type = mimetypes.guess_type(resolved)[0] or "application/octet-stream"
        return FileResponse(resolved, media_type=media_type, filename=os.path.basename(resolved))

    # SPA static hosting (production build)
    if FRONTEND_DIST.exists():
        assets_dir = FRONTEND_DIST / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/")
        def spa_index():
            return FileResponse(FRONTEND_DIST / "index.html")

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            # Don't shadow API/media
            if full_path.startswith("api/") or full_path.startswith("media/"):
                raise HTTPException(status_code=404, detail="not found")
            candidate = FRONTEND_DIST / full_path
            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(FRONTEND_DIST / "index.html")
    else:
        logger.warning("frontend/dist not found; API-only mode. Run `pnpm run build` in frontend/.")

        @app.get("/")
        def root_hint():
            return {
                "message": "Windrecorder API is running. Build frontend (frontend/dist) to serve the new WebUI.",
                "health": "/api/health",
            }

    return app


app = create_app()
