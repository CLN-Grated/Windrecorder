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
    parser.add_argument("--port", type=int, help="WebUI 监听端口（1-65535，默认读取设置）")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    from windrecorder.config import config, validate_webui_port
    from windrecorder.logger import get_logger

    try:
        port = validate_webui_port(config.webui_port if args.port is None else args.port)
    except ValueError as e:
        parser.error(str(e))
        return

    logger = get_logger(__name__)
    local_url = f"http://127.0.0.1:{port}"
    # 保留命令行诊断地址；托盘以 /api/health 判断服务是否真正就绪。
    print(f"Local URL: {local_url}", flush=True)
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
