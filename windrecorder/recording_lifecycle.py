"""Cross-process recording lifecycle status + cooperative stop request.

Used by tray (main.py), record_screen.py, and FastAPI so WebUI can show
recording / stopping / saving without hard-killing the recorder by default.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from typing import Any, Optional

from windrecorder.config import config
from windrecorder.file_utils import ensure_dir
from windrecorder.logger import get_logger

logger = get_logger(__name__)

# In-process stop flag (set by SIGBREAK / stop-file poll inside record_screen)
_stop_event = threading.Event()

RECORDING_STATES_BUSY = frozenset({"recording", "stopping", "saving"})
VALID_STATES = frozenset({"idle", "recording", "stopping", "saving", "stopped"})


def recording_status_path() -> str:
    return os.path.join(config.lock_file_dir, "recording_status.json")


def recording_stop_request_path() -> str:
    return os.path.join(config.lock_file_dir, "RECORD_STOP_REQUESTED")


def _now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def write_status(
    state: str,
    *,
    phase_message: str | None = None,
    pid: int | None = None,
    source: str = "record_screen",
) -> None:
    if state not in VALID_STATES:
        state = "idle"
    ensure_dir(config.lock_file_dir)
    payload = {
        "state": state,
        "phase_message": phase_message or state,
        "pid": pid,
        "updated_at": _now_iso(),
        "source": source,
    }
    path = recording_status_path()
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError as e:
        logger.warning(f"write recording status failed: {e}")


def read_status() -> dict[str, Any]:
    path = recording_status_path()
    if not os.path.isfile(path):
        return {
            "state": "idle",
            "phase_message": "idle",
            "pid": None,
            "updated_at": None,
            "source": None,
        }
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("bad status shape")
        state = str(data.get("state") or "idle")
        if state not in VALID_STATES:
            state = "idle"
        return {
            "state": state,
            "phase_message": str(data.get("phase_message") or state),
            "pid": data.get("pid"),
            "updated_at": data.get("updated_at"),
            "source": data.get("source"),
        }
    except Exception as e:
        logger.debug(f"read recording status failed: {e}")
        return {
            "state": "idle",
            "phase_message": "idle",
            "pid": None,
            "updated_at": None,
            "source": None,
        }


def request_stop(source: str = "tray") -> None:
    """Ask record_screen to stop at the next safe boundary (no process kill)."""
    ensure_dir(config.lock_file_dir)
    path = recording_stop_request_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(_now_iso())
    except OSError as e:
        logger.warning(f"write stop request failed: {e}")
    _stop_event.set()
    st = read_status()
    if st.get("state") in ("recording", "stopping", "saving"):
        write_status(
            "stopping",
            phase_message="stopping",
            pid=st.get("pid"),
            source=source,
        )
    else:
        write_status("stopping", phase_message="stopping", source=source)


def clear_stop_request() -> None:
    path = recording_stop_request_path()
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as e:
        logger.debug(f"clear stop request: {e}")


def is_stop_requested() -> bool:
    if _stop_event.is_set():
        return True
    return os.path.isfile(recording_stop_request_path())


def set_stop_event() -> None:
    _stop_event.set()


def clear_stop_event() -> None:
    _stop_event.clear()


def reset_stop_flags() -> None:
    clear_stop_event()
    clear_stop_request()


def get_public_status() -> dict[str, Any]:
    """Status for API / clear-data gate (file state + lock PID)."""
    from windrecorder import record

    st = read_status()
    state = str(st.get("state") or "idle")
    lock_alive = bool(record.is_recording())

    # Recover stale status: process gone but file still says busy
    if state in RECORDING_STATES_BUSY and not lock_alive:
        state = "idle"
        write_status("idle", phase_message="idle", pid=None, source="reconcile")

    # Lock alive but status idle/missing → treat as recording
    if lock_alive and state in ("idle", "stopped"):
        state = "recording"

    is_busy = state in RECORDING_STATES_BUSY or lock_alive
    message_key = {
        "idle": "recording_status_idle",
        "recording": "recording_status_recording",
        "stopping": "recording_status_stopping",
        "saving": "recording_status_saving",
        "stopped": "recording_status_stopped",
    }.get(state, "recording_status_idle")

    return {
        "state": state,
        "phase_message": st.get("phase_message") or state,
        "is_recording": is_busy,
        "is_busy": is_busy,
        "can_clear_data": not is_busy,
        "message_key": message_key,
        "pid": st.get("pid"),
        "updated_at": st.get("updated_at"),
        "source": st.get("source"),
        "stop_requested": is_stop_requested(),
    }
