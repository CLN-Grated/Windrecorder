from __future__ import annotations

import mimetypes
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from windrecorder import __version__
from windrecorder.api import (
    auth,
    config_service,
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


class WebUIAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if auth.is_public_path(path):
            return await call_next(request)
        # Protect /api/* and /media/*
        if path.startswith("/api") or path.startswith("/media"):
            try:
                auth.require_auth(request)
            except HTTPException as e:
                return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(title="Windrecorder Web API", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(WebUIAuthMiddleware)

    @app.get("/api/health", response_model=HealthResponse)
    def health():
        return HealthResponse(
            ok=True,
            version=__version__,
            lang="sc",
            webui_backend=getattr(config, "webui_backend", "fastapi"),
        )

    # ----- Auth -----
    @app.get("/api/auth/status")
    def auth_status(request: Request):
        enabled = auth.password_enabled()
        authenticated = (not enabled) or auth.token_valid(auth.read_token_from_request(request))
        return {"password_enabled": enabled, "authenticated": authenticated}

    @app.post("/api/auth/login")
    def auth_login(response: Response, password: str = Form(...)):
        if not auth.password_enabled():
            return {"ok": True, "authenticated": True, "password_enabled": False}
        if not auth.verify_password(password):
            raise HTTPException(status_code=401, detail="invalid_password")
        token = auth.issue_token()
        auth.set_auth_cookie(response, token)
        return {"ok": True, "authenticated": True, "token": token, "password_enabled": True}

    @app.post("/api/auth/logout")
    def auth_logout(request: Request, response: Response):
        auth.revoke_token(auth.read_token_from_request(request))
        auth.clear_auth_cookie(response)
        return {"ok": True, "authenticated": False}

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

    # ----- Global Search (OCR only; AI/img-embed removed from WebUI Next) -----
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
    def state_lightbox(
        year: int = Form(...),
        month: int = Form(...),
        quality: str = Form("standard"),
    ):
        q = (quality or "standard").strip().lower()
        if q not in ("standard", "hd"):
            raise HTTPException(status_code=400, detail="quality must be 'standard' or 'hd'")
        return state_service.generate_lightbox(year, month, quality=q)

    @app.post("/api/state/wordcloud")
    def state_wordcloud(year: int = Form(...), month: int = Form(...)):
        return state_service.generate_wordcloud(year, month)

    # ----- Recording / Setting -----
    @app.get("/api/recording/status")
    def recording_status():
        return recording_service.get_recording_status()

    @app.post("/api/recording/stop")
    def recording_stop():
        return recording_service.request_recording_stop()

    @app.get("/api/recording/options")
    def recording_options():
        return recording_service.get_options()

    @app.post("/api/recording/save")
    def recording_save(payload: dict):
        return recording_service.save_settings(payload)

    @app.post("/api/recording/benchmark")
    def recording_benchmark(payload: dict):
        kind = str(payload.get("kind") or "compress")
        return recording_service.start_benchmark(kind)

    @app.get("/api/recording/benchmark/status")
    def recording_benchmark_status():
        return recording_service.get_benchmark_status()

    @app.get("/api/setting/options")
    def setting_options():
        return setting_service.get_options()

    @app.post("/api/setting/save")
    def setting_save(payload: dict):
        return setting_service.save_settings(payload)

    @app.get("/api/setting/db-status")
    def setting_db_status():
        return setting_service.get_db_status()

    @app.post("/api/setting/update-db")
    def setting_update_db(shutdown_after: bool = Form(False)):
        return setting_service.start_update_db(shutdown_after=shutdown_after)

    @app.get("/api/setting/update-db/status")
    def setting_update_db_status():
        return setting_service.get_update_db_status()

    @app.get("/api/setting/about")
    def setting_about():
        return setting_service.get_about()

    @app.get("/api/setting/clear-data/preview")
    def setting_clear_data_preview():
        return setting_service.get_clear_data_preview()

    @app.post("/api/setting/clear-data")
    def setting_clear_data(payload: dict):
        scopes = payload.get("scopes") or []
        if not isinstance(scopes, list):
            raise HTTPException(status_code=400, detail="scopes must be a list")
        confirm = bool(payload.get("confirm"))
        result = setting_service.clear_local_data([str(s) for s in scopes], confirm=confirm)
        if not result.get("ok") and result.get("error") == "recording":
            raise HTTPException(status_code=409, detail=result.get("detail") or "recording")
        if not result.get("ok") and result.get("error") in ("confirm_required", "empty_scopes", "invalid_scopes"):
            raise HTTPException(status_code=400, detail=result.get("detail") or result.get("error"))
        return result

    @app.get("/media/video/{filename}")
    def media_video(filename: str):
        path = oneday_service.resolve_video_path(filename)
        if not path:
            raise HTTPException(status_code=404, detail="video not found")
        media_type = mimetypes.guess_type(path)[0] or "video/mp4"
        # inline：供 HTML5 <video> 页内播放；attachment 易被 IDM 等下载器劫持导致灰屏
        return FileResponse(
            path,
            media_type=media_type,
            filename=os.path.basename(path),
            content_disposition_type="inline",
        )

    @app.get("/media/file/{token}/{filename}")
    def media_file(token: str, filename: str):
        """Path-based media URL: last segment is real filename (mobile download / tab title)."""
        resolved = oneday_service.resolve_media_file_token(token, filename)
        if not resolved:
            raise HTTPException(status_code=404, detail="file not found or not allowed")
        media_type = mimetypes.guess_type(resolved)[0] or "application/octet-stream"
        return FileResponse(
            resolved,
            media_type=media_type,
            filename=os.path.basename(resolved),
            content_disposition_type="inline",
        )

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
