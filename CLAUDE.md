# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI agent constraints

- 不允许调用子代理（subagent）。所有任务必须由主代理直接完成。

## Agent pitfalls / 易错约定（Windrecorder）

本仓库多进程 + 双轨 WebUI，下列约定避免反复踩坑：

### 新 WebUI：改 `frontend/src` 必须构建

- 生产由 `api_server` 提供 **`frontend/dist`**（gitignore，**不进 git**）。
- 改 React/TS 后必须：`cd frontend && pnpm install && pnpm run build`。
- 未 build = 用户仍跑旧 bundle；手测/验收前确认 dist 已更新（或硬刷新）。
- 开发可用 `pnpm run dev` + API；勿与「只改 src 却打开 dist 服务」混淆。

### 多进程与「是否在录制」

- 托盘 `main.py` 的 `recording_process` **仅内存**；API / 清除门禁看 **锁文件 PID + 进程存活**，以及 `recording_lifecycle` 状态文件。
- 改停录、清除数据门禁时勿只改托盘变量。
- 已在跑的 `record_screen` **不会**加载新代码；测协作停录须重启录制进程。

### pystray 回调禁止长阻塞

- 托盘菜单回调里 **禁止** 长时间 `wait` / `sleep` / 同步重活。
- 协作停录的 `wait` 放 **后台线程**；回调只发 stop 请求 + Toast 后立刻 return。
- 否则托盘无响应，结果 Toast 也发不出去。

### 停录语义边界

| 入口 | 行为 |
|------|------|
| 托盘「暂停记录」 | **协作**：stop 请求 + 片段边界退出，默认不 `taskkill` |
| 托盘「退出」 | **优雅**：停 WebUI + 协作停录，30s 超时仅提示，录制退出后才 `os._exit` |
| Ctrl+C / 关控制台 | **强制**：`taskkill /PID /T /F` + 清锁 + `os._exit` |

状态源：`cache/locks/recording_status.json`、`RECORD_STOP_REQUESTED`（`windrecorder/recording_lifecycle.py`）。

### 托盘启动路径：控制导入成本

- `main.py` **不要**顶层 `import streamlit`（Streamlit 为 optional extra `legacy-webui`）。
- 勿在托盘热路径顶层拉重 UI 库；弹窗类依赖应懒加载。
- Streamlit 仅用于 `webui.py` / `windrecorder/ui/*` / extension；共享模块对 `st` 用函数内懒加载。

### 前端门禁 UI 与轮询

- 对话框依赖「外部进程状态」时：**open 期间持续轮询**，不能只在打开时拉一次。
- 多状态 tip 优先级：**busy**（录制 / 停止中 / 保存中）> 成功绿 tip，避免 `sawX` 类标志盖住当前 busy。

### Windows 进程清理

- 强制杀进程优先 `taskkill /PID /T /F`；「进程不存在」应静默/debug，勿刷控制台。
- 勿提交 `userdata/`、`cache/` 等运行时目录。

## Git Commits

### 语言与风格

- **尽量用中文**撰写 git 提交说明（title + body），表达清晰、完整。
- 采用约定式提交（Conventional Commits）结构；**type 可用英文**（`feat` / `fix` / `docs` / `refactor` / `chore` 等），**描述部分用中文**。
- 标题（第一行）建议：`<type>(<scope>): <中文简述>`，约 50 字内，祈使/完成式均可，但同一仓库内保持一致。
- 需要时用空行后接正文：说明「为什么改」、关键点或破坏性变更；bullet 也用中文。
- 避免纯英文流水账标题（如仅 `feat: update stuff`）；专有名词、API 路径、组件名可保留英文。

示例：

```
feat(webui): 设置页支持永久清除本地数据

- 预览各范围占用与文件数
- 二次确认「我已了解此操作不可轻易恢复」
- 使用 safe_delete，不进回收站

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

### Co-Authored-By

提交时务必在 commit message **末尾**加上系统提示词里的 Co-Authored-By 行，例如：

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

不要省略、改写或删掉这一行。

## Project overview

Windrecorder is a **Windows-only**, fully-local personal memory search engine (Rewind.ai / Copilot Recall alternative). It continuously captures the screen, indexes OCR text / window titles / optional image embeddings into local databases, and provides a web UI for rewind, search, and activity stats. **WebUI is dual-track**: legacy Streamlit (`webui.py`) and next-gen **FastAPI + React/shadcn** (`api_server.py` + `frontend/`). No cloud required for core features; optional OpenAI-compatible LLM endpoints power tag extraction, day poems, and the natural-language search extension.

- License: GPL-2.0
- Version: `windrecorder/__init__.py` (`__version__`)
- Python: `>=3.10,<3.13` (defaults to 3.12; 3.10 and 3.11 remain supported)
- Dependency manager: uv (in-project venv: `.venv`, lockfile: `uv.lock`)

## Common commands

### Install / update

```bash
# First-time or after pull (Windows batch equivalent of install_update.bat)
# install_update.bat bootstraps uv if missing, then uv automatically
# prepares a compatible Python, creates .venv, syncs uv.lock, and runs:
uv run --locked onboard_setting.py
```

System prerequisites (not installed by uv): **FFmpeg + ffprobe on PATH**, Git. Python 3.12 is provisioned by uv when needed; Python 3.10 and 3.11 remain supported.

### Run the app

```bash
# Full app (system tray + optional auto-start recording + WebUI on demand)
uv run --locked main.py
# 禁用托盘 WebUI 入口（只保留录制与托盘其他功能）
uv run --locked main.py --nowebui
# Or: start_app.bat (uv run main.py)

# WebUI（FastAPI + frontend/dist；**改 frontend/src 后必须构建**）
cd frontend && pnpm install && pnpm run build && cd ..
uv run --locked python api_server.py  # 默认读取设置端口 54100
# Dev: API on 17831 + Vite HMR (proxies /api /media)
# uv run --locked python api_server.py --port 17831
# cd frontend && pnpm run dev

# Recording daemon only
uv run --locked record_screen.py
```

**Frontend delivery:** `frontend/dist` is gitignored. After editing `frontend/src`, always `pnpm run build` before validating via tray/`api_server` SPA. Hard-refresh the browser if the UI looks stale.

Logs land under `cache/logs/` (`webui_fastapi.log`, `webui_fastapi.err`, `recording.log`, etc.).

### Lint / format

Pre-commit hooks (`.pre-commit-config.yaml`); `ocr_lib/` is excluded:

```bash
uv run pre-commit install
uv run pre-commit run --all-files

# Direct equivalents:
uv run black . --line-length 127 --exclude ocr_lib
uv run isort . --profile black --skip ocr_lib
uv run flake8 . --ignore=E501,E203,W503 --max-line-length=127 --exclude=ocr_lib
```

There is **no automated unit-test suite** in this repo. Related checks that do exist:

- OCR accuracy assets under `__assets__/OCR_test_*` used by `ocr_manager.ocr_benchmark()`
- Extension install smoke scripts: `extension/*/ _test_install.py`
- Encoder benchmarks: `record.encode_preset_benchmark_test()`, `record.record_encode_preset_benchmark_test()`

## High-level architecture

### Process model

```
start_app.bat
    └── main.py                    # tray (pystray), single-instance via FileLock
            ├── subprocess: python api_server.py     # WebUI（FastAPI + frontend/dist）
            └── subprocess: record_screen.py         # capture + idle maintain
```

- `main.py` owns tray lifecycle, starts/stops FastAPI WebUI and recording processes, and uses `FileLock` on `config.tray_lock_path` to prevent double-start. WebUI starts on the configured `webui_port` (default `54100`); a background worker confirms `/api/health` before exposing the address or opening the browser.
- **Pause recording** is cooperative (`recording_lifecycle` stop request + segment boundary). **Tray exit / Ctrl+C** force-kills children (`taskkill /T /F`) and clears locks.
- `record_screen.py` holds `config.record_lock_path`, runs capture + idle-maintenance threads, restarts crashed workers, and honors cooperative stop.
- `webui.py` is a thin Streamlit shell: tabs call `windrecorder.ui.*.render()` (optional extra `legacy-webui`).
- `api_server.py` / `windrecorder/api/` is the FastAPI layer reusing `oneday`, `db_manager`, etc.; SPA static files from `frontend/dist`.
- `frontend/` is Vite + React + TS + Tailwind v4 + shadcn/ui. Copy for new WebUI often lives in `frontend/src/lib/zh-messages.ts`.

Do not assume a single process; state shared between tray/recorder/webui is files + SQLite + locks under `cache/locks/` (including `recording_status.json` / `RECORD_STOP_REQUESTED`).

### Package layout (`windrecorder/`)

| Module | Role |
|--------|------|
| `config.py` | `Config` singleton (`config`); defaults in `config_src/config_default.json`, user overrides in `userdata/config_user.json`. Persist with `config.set_and_save_config(attr, value)`. |
| `const.py` | Paths, dataframe column names, OCR language maps, LLM system prompts, debug trigger filenames. |
| `db_manager.py` | Monthly SQLite DBs (`db/` → `user_YYYY-MM_wind.db`), table `video_text`, search/pagination. Singleton: `db_manager`. |
| `ocr_manager.py` | Multi-engine OCR dispatch (`ocr_image`), video iframe extract → OCR → DB write (`ocr_manager_main` / `ocr_process_single_video`), similarity dedup. |
| `record.py` | Two capture modes: `record_screen_via_ffmpeg` and `record_screen_via_screenshot_process`; screenshot cache → video; compress/clean outdated videos. |
| `recording_lifecycle.py` | Cross-process recording status + cooperative stop request files for tray/API/WebUI. |
| `record_wintitle.py` | Foreground window title / deep-linking capture. |
| `img_embed_manager.py` | Optional UForm + FAISS image/text embeddings (`db_imgemb/`). Only import when `config.img_embed_module_install`. |
| `llm.py` | OpenAI-compatible client (`request_llm_one_shot`), day tags / day poems. |
| `oneday.py` / `state.py` / `wordcloud.py` | Day timeline, stats/lightbox, wordcloud. |
| `utils.py` | i18n (`get_text` as `_t`), time/path/display helpers, ffmpeg checks, `kill_recording`. |
| `lock.py` / `logger.py` / `file_utils.py` | Cross-process locks, logging, filesystem helpers. |
| `ui/` | Streamlit tabs: `oneday`, `search`, `state`, `lab`, `recording`, `setting`, shared `components`. |
| `api/` | FastAPI app (`app.py`), Oneday/recording/setting services; media + SPA hosting. |
| `upgrade_migration_routine.py` | One-shot migrations on upgrade / onboard. |

Root scripts outside the package: `main.py`, `webui.py`, `api_server.py`, `record_screen.py`, `onboard_setting.py`. Frontend app: `frontend/` (pnpm).

### Data flow

1. **Capture** (`record_mode`):
   - `screenshot_array` (default-ish flexible path): screenshot every `screenshot_interval_second`, OCR/index only on content change, convert screenshot dirs to video later.
   - `ffmpeg`: 15-minute (default `record_seconds=900`) video segments; OCR indexing after segment completes → query lag ~segment length.
2. **Index**: frames → `ocr_image()` → rows in monthly SQLite (`DATAFRAME_COLUMN_NAMES` in `const.py`: `videofile_name`, `ocr_text`, `win_title`, `thumbnail`, `deep_linking`, …).
3. **Idle maintain** (screen static / lock screen / no user): OCR backlog, video compress/delete, optional image embedding batch, optional LLM day tags.
4. **Query**: WebUI OCR keyword search (`db_manager.db_search_data`), optional vector search (`img_embed_manager`), optional LLM natural-language extension.

### Important runtime directories (mostly gitignored)

| Path | Contents |
|------|----------|
| `userdata/` | `config_user.json`, notes CSVs |
| `videos/` | Recorded / compressed videos (YYYY-MM subdirs) |
| `db/` | Monthly SQLite OCR DBs (`*_TEMP_READ.db` temp copies while indexing) |
| `db_imgemb/` | FAISS image embedding indices |
| `cache/` | locks, logs, i_frames, win_title, screenshot convert cache |
| `cache_screenshot/` | Live screenshot capture cache |
| `result_*` | Generated wordcloud / timeline / lightbox / AI tags / poems |
| `extension/` | Optional plugins (OCR engines, img embed, LLM search, …) |
| `ocr_lib/` | Vendored ChineseOCR_lite_onnx (do not format/lint) |

Moving the install: delete `.venv`, relocate folder (keep `userdata` + data dirs), re-run `install_update.bat`.

### Configuration

- Defaults: `windrecorder/config_src/config_default.json`
- User file created/merged at runtime: `userdata/config_user.json`
- On upgrade, `update_config_files_from_default_to_user()` adds new keys and drops removed ones.
- i18n: Streamlit / tray often use `windrecorder/config_src/languages.json` via `_t("key")` (product is Chinese-first). New WebUI also uses `frontend/src/lib/zh-messages.ts`.
- Record/compress FFmpeg presets: `record_preset.json`, `video_compress_preset.json`.
- Core Python deps do **not** require Streamlit; optional extra: `uv sync --locked --extra legacy-webui`.

Key config fields agents touch often: `record_mode`, `ocr_engine`, `support_ocr_lst`, `OCR_index_strategy`, `enable_img_embed_search`, `img_embed_module_install`, `open_ai_*`, `exclude_words`, `multi_display_record_strategy`, `webui_port`, `webui_auto_open_browser`.

### OCR engines

`config.ocr_engine` selects implementation in `ocr_manager.ocr_image()`:

- Built-in: `Windows.Media.Ocr.Cli`, vendored `ChineseOCR_lite_onnx`
- Extensions install and register into `config.support_ocr_lst`: PaddleOCR/RapidOCR, WeChatOCR, Tesseract

Third-party OCR contribution steps are documented in `extension/how_to_contribute_third_party_ocr_support.md` (register in config + `ocr_manager` + `OCR_SUPPORT_CONFIG` / optional `OCR_BENCHMARK_TEST_SET` in `const.py`).

### Extensions

Each folder under `extension/` typically has:

- `meta.json` (`extension_name`, `developer_*`, `version`, `description_markdown`)
- A `.bat` that uses `uv run --locked` to execute a Python/Streamlit entry from repo root
- Optional `_test_install.py` / `_uninstall.py` / `_webui.py`
- Optional extras in `pyproject.toml`: `paddle-ocr` (`rapidocr-onnxruntime`), `wechat-ocr` (`wechat-ocr`), and `img-embedding` (`uform`). Install with `uv sync --locked --inexact --extra <name>`.

Example: `extension/LLM_search_and_summary/` — natural language search/summary via `llm` + `db_manager` (`_natural_search.py`).

Image embedding module is **not** a core dependency; install via `extension/install_img_embedding_module/`. Always guard imports:

```python
if config.img_embed_module_install:
    try:
        from windrecorder import img_embed_manager
    except ModuleNotFoundError:
        config.set_and_save_config("img_embed_module_install", False)
```

### LLM integration

- Client: `windrecorder/llm.py` → OpenAI SDK with `config.open_ai_base_url` / `open_ai_api_key` / `open_ai_modelname`
- Prompts/temperatures: `const.py` (`LLM_SYSTEM_PROMPT_*`)
- Setup guide for users: `__assets__/how_to_set_LLM_api_endpoint_*.md`

## Coding conventions specific to this repo

- **Line length 127**, Black + isort (black profile); flake8 ignores `E501,E203,W503`.
- **Never reformat or commit binary/vendored trees**: `ocr_lib/`, user `userdata/`, `wxocr-binary/`, etc.
- Prefer existing helpers in `file_utils`, `utils`, `db_manager`, `recording_lifecycle` over new ad-hoc path/SQL/status logic.
- User-facing strings: Streamlit/tray via `_t("key")` + `languages.json`; new WebUI often via `zh-messages.ts`. Keep languages consistent when adding copy.
- Cross-process exclusivity: use `FileLock` from `windrecorder.lock` (same pattern as tray/record/img_emb locks). Recording busy/clear gates should reuse `recording_lifecycle.get_public_status()` where possible.
- DB schema evolution: extend via `db_manager.db_ensure_row_exist` / `db_update_table_product_routine`, not one-off ALTER scripts users must run.
- Comments and many log messages are bilingual or Chinese-first; match surrounding file language rather than rewriting wholesale.
- Windows-only APIs (`pywin32`, `mss`, `uiautomation`, `Windows.Media.Ocr.Cli`) — do not introduce cross-platform abstractions unless asked.
- Complex changes: prefer **separate commits by concern** when the user asks（例如 backend / tray / frontend 拆分）.

## Debug / operational triggers

Place empty files in the project root:

- `DEBUGMODE.txt` — debug mode trigger (`const.DEBUGMODE_TRIGGER`)
- `hide_CLI_by_python.txt` — hide CLI window when started via `start_app.bat` (see README / issue #232)

If WebUI shows stale/missing recent data while indexing, `db/*_TEMP_READ.db` files may need to be removed after indexing finishes (known behavior; see README Q&A).
