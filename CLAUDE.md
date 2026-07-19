# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI agent constraints

- 不允许调用子代理（subagent）。所有任务必须由主代理直接完成。

## Project overview

Windrecorder is a **Windows-only**, fully-local personal memory search engine (Rewind.ai / Copilot Recall alternative). It continuously captures the screen, indexes OCR text / window titles / optional image embeddings into local databases, and provides a Streamlit web UI for rewind, search, and activity stats. No cloud required for core features; optional OpenAI-compatible LLM endpoints power tag extraction, day poems, and the natural-language search extension.

- License: GPL-2.0
- Version: `windrecorder/__init__.py` (`__version__`)
- Python: `>=3.10,<3.12` (3.12 is **not** supported)
- Dependency manager: uv (in-project venv: `.venv`, lockfile: `uv.lock`)

## Common commands

### Install / update

```bash
# First-time or after pull (Windows batch equivalent of install_update.bat)
# install_update.bat bootstraps uv if missing, then uv automatically
# prepares a compatible Python, creates .venv, syncs uv.lock, and runs:
uv run --locked onboard_setting.py
```

System prerequisites (not installed by uv): **FFmpeg + ffprobe on PATH**, Git. Python 3.11 is provisioned by uv when needed.

### Run the app

```bash
# Full app (system tray + optional auto-start recording + WebUI on demand)
uv run --locked main.py
# Or: start_app.bat (uv run main.py)

# Web UI only (Streamlit)
uv run --locked streamlit run webui.py

# Recording daemon only
uv run --locked record_screen.py
```

Logs land under `cache/logs/` (`webui.log`, `recording.log`, etc.).

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
            ├── subprocess: streamlit run webui.py   # search/review UI
            └── subprocess: record_screen.py         # capture + idle maintain
```

- `main.py` owns tray lifecycle, starts/stops Streamlit and recording processes, scrapes Streamlit stdout for Local/Network URL, uses `FileLock` on `config.tray_lock_path` to prevent double-start.
- `record_screen.py` holds `config.record_lock_path`, runs capture + idle-maintenance threads, and restarts crashed worker threads.
- `webui.py` is a thin Streamlit shell: tabs call `windrecorder.ui.*.render()`.

Do not assume a single process; state shared between tray/recorder/webui is files + SQLite + locks under `cache/locks/`.

### Package layout (`windrecorder/`)

| Module | Role |
|--------|------|
| `config.py` | `Config` singleton (`config`); defaults in `config_src/config_default.json`, user overrides in `userdata/config_user.json`. Persist with `config.set_and_save_config(attr, value)`. |
| `const.py` | Paths, dataframe column names, OCR language maps, LLM system prompts, debug trigger filenames. |
| `db_manager.py` | Monthly SQLite DBs (`db/` → `user_YYYY-MM_wind.db`), table `video_text`, search/pagination. Singleton: `db_manager`. |
| `ocr_manager.py` | Multi-engine OCR dispatch (`ocr_image`), video iframe extract → OCR → DB write (`ocr_manager_main` / `ocr_process_single_video`), similarity dedup. |
| `record.py` | Two capture modes: `record_screen_via_ffmpeg` and `record_screen_via_screenshot_process`; screenshot cache → video; compress/clean outdated videos. |
| `record_wintitle.py` | Foreground window title / deep-linking capture. |
| `img_embed_manager.py` | Optional UForm + FAISS image/text embeddings (`db_imgemb/`). Only import when `config.img_embed_module_install`. |
| `llm.py` | OpenAI-compatible client (`request_llm_one_shot`), day tags / day poems. |
| `oneday.py` / `state.py` / `wordcloud.py` / `flag_mark_note.py` | Day timeline, stats/lightbox, wordcloud, flag notes. |
| `utils.py` | i18n (`get_text` as `_t`), time/path/display helpers, ffmpeg checks. |
| `lock.py` / `logger.py` / `file_utils.py` | Cross-process locks, logging, filesystem helpers. |
| `ui/` | Streamlit tabs: `oneday`, `search`, `state`, `lab`, `recording`, `setting`, shared `components`. |
| `upgrade_migration_routine.py` | One-shot migrations on upgrade / onboard. |

Root scripts outside the package: `main.py`, `webui.py`, `record_screen.py`, `onboard_setting.py`.

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
- i18n strings: `windrecorder/config_src/languages.json` (`en` / `sc` / `ja`); UI copy via `_t("key")`.
- Record/compress FFmpeg presets: `record_preset.json`, `video_compress_preset.json`.

Key config fields agents touch often: `record_mode`, `ocr_engine`, `support_ocr_lst`, `OCR_index_strategy`, `enable_img_embed_search`, `img_embed_module_install`, `open_ai_*`, `exclude_words`, `multi_display_record_strategy`.

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
- Prefer existing helpers in `file_utils`, `utils`, `db_manager` over new ad-hoc path/SQL logic.
- User-facing strings go through `_t("key")` and `languages.json` (en/sc/ja) when adding UI copy.
- Cross-process exclusivity: use `FileLock` from `windrecorder.lock` (same pattern as tray/record/img_emb locks).
- DB schema evolution: extend via `db_manager.db_ensure_row_exist` / `db_update_table_product_routine`, not one-off ALTER scripts users must run.
- Comments and many log messages are bilingual or Chinese-first; match surrounding file language rather than rewriting wholesale.
- Windows-only APIs (`pywin32`, `mss`, `uiautomation`, `Windows.Media.Ocr.Cli`) — do not introduce cross-platform abstractions unless asked.

## Debug / operational triggers

Place empty files in the project root:

- `DEBUGMODE.txt` — debug mode trigger (`const.DEBUGMODE_TRIGGER`)
- `hide_CLI_by_python.txt` — hide CLI window when started via `start_app.bat` (see README / issue #232)

If WebUI shows stale/missing recent data while indexing, `db/*_TEMP_READ.db` files may need to be removed after indexing finishes (known behavior; see README Q&A).
