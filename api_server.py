"""Windrecorder FastAPI WebUI entrypoint.

Usage:
    uv run --locked python api_server.py
    uv run --locked python api_server.py --port 17831
"""

from __future__ import annotations

import argparse
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
os.chdir(PROJECT_ROOT)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def main():
    parser = argparse.ArgumentParser(description="Windrecorder FastAPI WebUI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0, help="0 = pick an free port")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    from windrecorder import utils
    from windrecorder.logger import get_logger

    logger = get_logger(__name__)
    port = args.port or utils.find_available_port()

    # Print URLs in a tray-scrapeable form (keep Streamlit-like markers)
    local_url = f"http://127.0.0.1:{port}"
    print(f"Local URL: {local_url}", flush=True)
    print(f"Network URL: http://0.0.0.0:{port}", flush=True)
    logger.info(f"Starting FastAPI WebUI on {local_url}")

    import uvicorn

    uvicorn.run(
        "windrecorder.api.app:app",
        host=args.host,
        port=port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
