# Windrecorder Frontend (WebUI Next)

Vite + React + TypeScript + Tailwind CSS v4 + **shadcn/ui** (`--preset b27GcrRo`).

Package manager: **pnpm** (do not use npm / yarn).

Full dual-track migration in progress: **Oneday / Search / State / Recording / Setting / Lab** routes are live.
Streamlit remains available from the tray as Legacy.

## Develop

```bash
# terminal 1 — API (repo root)
uv run --locked python api_server.py --port 17831

# terminal 2 — Vite HMR
cd frontend
pnpm install
pnpm run dev
```

Vite proxies `/api` and `/media` to `http://127.0.0.1:17831`.

## Production build

```bash
cd frontend
pnpm run build
```

Artifacts go to `frontend/dist/`. `api_server.py` / `windrecorder.api.app` serves that directory when present.

## Tray dual-track

`main.py` can start either:

- **New WebUI**: `python api_server.py` (FastAPI + static dist)
- **Legacy Streamlit**: `streamlit run webui.py`

Default preference: `config.webui_backend = "fastapi"` (`userdata/config_user.json` after merge from `config_default.json`).

## shadcn

```bash
pnpm dlx shadcn@latest add <component>
# re-apply design preset:
pnpm dlx shadcn@latest apply --preset b27GcrRo
```
