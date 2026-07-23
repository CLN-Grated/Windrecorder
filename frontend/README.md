# Windrecorder Frontend (WebUI Next)

Vite + React + TypeScript + Tailwind CSS v4 + **shadcn/ui** (`--preset b27GcrRo`).

Package manager: **pnpm** (do not use npm / yarn).

FastAPI WebUI 已覆盖 **Oneday / Search / State / Recording / Setting / Lab** 路由；托盘仅启动这一套 WebUI。

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

## Tray WebUI

`main.py` 仅启动 FastAPI WebUI（`python api_server.py` + `frontend/dist`）。默认端口为 `54100`，可在 WebUI「设置」中修改；同处可设置启动完成后是否自动打开默认浏览器。

开发或排障时可通过 `python api_server.py --port <端口>` 临时覆盖配置端口，不会写回用户配置。

## shadcn

```bash
pnpm dlx shadcn@latest add <component>
# re-apply design preset:
pnpm dlx shadcn@latest apply --preset b27GcrRo
```
