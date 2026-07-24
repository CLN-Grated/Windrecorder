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

## 前后端分离

前端可单独部署到静态托管 / Serverless：

1. `pnpm run build`，将 `frontend/dist` 部署到任意静态站点。
2. 本机或服务器运行 `uv run --locked python api_server.py`（默认 `127.0.0.1:54100`）。
3. 打开静态站点 →「设置 → 连接 / API」填写 API 地址（如 `http://127.0.0.1:54100`）→「检测并应用」。
4. 地址保存在浏览器 `localStorage`（`wr_api_base`）；登录 token 为 `wr_webui_token`，请求统一带 `Authorization: Bearer`。
5. 后端 CORS 为 `*`；鉴权不依赖 Cookie credentials。

本地一体化（托盘 / `api_server` 托管 dist）时可不填 API 地址，默认相对路径。

## shadcn

```bash
pnpm dlx shadcn@latest add <component>
# re-apply design preset:
pnpm dlx shadcn@latest apply --preset b27GcrRo
```
