import os
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from os import getpid
from subprocess import Popen

import pygetwindow
import pystray
import requests
import win32con
import win32gui
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
os.chdir(PROJECT_ROOT)

from windrecorder import file_utils, utils, win_ui  # NOQA: E402
from windrecorder.config import config, get_webui_launch_settings  # NOQA: E402
from windrecorder.const import HIDE_CLI_TRIGGER  # NOQA: E402
from windrecorder.exceptions import LockExistsException  # NOQA: E402
from windrecorder.lock import FileLock  # NOQA: E402
from windrecorder.logger import get_logger  # NOQA: E402
from windrecorder.utils import get_text as _t  # NOQA: E402

logger = get_logger(__name__)

# 定义存储标准输出的日志文件路径
WEBUI_STDOUT_PATH = os.path.join(config.log_dir, "webui_fastapi.log")
WEBUI_STDERR_PATH = os.path.join(config.log_dir, "webui_fastapi.err")
RECORDING_STDOUT_PATH = os.path.join(config.log_dir, "recording.log")
RECORDING_STDERR_PATH = os.path.join(config.log_dir, "recording.err")

WEBUI_OPEN_TIMEOUT = 15
WEBUI_HEALTH_CHECK_INTERVAL = 0.25

webui_process: Popen | None = None
recording_process: Popen | None = None  # 存储录制进程的实例，表示是否正在进行屏幕录制。初始值为 None，表示没有正在运行的录制进程。
webui_local_url = ""
webui_starting = False
webui_ready = False
_webui_launch_id = 0
_webui_lock = threading.Lock()


def get_tray_icon(state="recording"):
    IMAGE_STATE = {"recording": "icon-tray.png", "record_pause": "icon-tray-pause.png"}
    image = Image.open(os.path.join("__assets__", IMAGE_STATE[state]))
    image = image.convert("RGBA")
    return image


def update(icon: pystray.Icon, item: pystray.MenuItem):
    webbrowser.open(os.path.join(PROJECT_ROOT, "install_update.bat"))
    on_exit(icon=icon, item=item)


file_utils.ensure_dir("cache")
file_utils.ensure_dir(config.log_dir)
file_utils.ensure_dir(config.lock_file_dir)
file_utils.ensure_dir(config.maintain_lock_path)

file_utils.empty_directory(config.maintain_lock_path)


# 调用浏览器打开 WebUI
def open_webui(icon: pystray.Icon, item: pystray.MenuItem):
    if webui_ready and webui_local_url:
        webbrowser.open(webui_local_url)


# 调用浏览器打开更新日记
def open_web_changelog(icon: pystray.Icon, item: pystray.MenuItem):
    webbrowser.open("https://github.com/yuka-friends/Windrecorder/blob/main/CHANGELOG.md")


def setup(icon: pystray.Icon):
    icon.visible = True
    if config.start_recording_on_startup:
        icon.notify(message=_t("tray_notify_text"), title=_t("tray_notify_title"))
    else:
        icon.notify(message=_t("tray_notify_text_start_without_record"), title=_t("tray_notify_title_record_pause"))


def _refresh_tray_menu(icon: pystray.Icon | None) -> None:
    if icon is None:
        return
    try:
        icon.update_menu()
    except Exception as e:
        logger.debug(f"refresh tray menu: {e}")


def _is_current_webui_launch(proc: Popen, launch_id: int) -> bool:
    with _webui_lock:
        return webui_process is proc and _webui_launch_id == launch_id


def _webui_failure_message(port: int, timed_out: bool) -> str:
    try:
        with open(WEBUI_STDERR_PATH, "r", encoding="utf-8") as f:
            error_text = f.read().lower()
    except OSError:
        error_text = ""

    if "address already in use" in error_text or "only one usage" in error_text:
        return f"WebUI 端口 {port} 已被占用，未改用其他端口。请修改设置后重试。"
    if timed_out:
        return f"WebUI 启动超时，请检查 '{config.log_dir}/webui_fastapi.*'。"
    return f"WebUI 启动失败，请检查 '{config.log_dir}/webui_fastapi.*'。"


def _finish_webui_start_failure(proc: Popen, launch_id: int, port: int, icon: pystray.Icon | None, timed_out: bool) -> None:
    global webui_process, webui_local_url, webui_ready, webui_starting

    with _webui_lock:
        if webui_process is not proc or _webui_launch_id != launch_id:
            return
        webui_process = None
        webui_local_url = ""
        webui_ready = False
        webui_starting = False

    try:
        if proc.poll() is None and proc.pid:
            _taskkill_tree(proc.pid)
    except Exception as e:
        logger.debug(f"stop failed WebUI process: {e}")
    if icon is not None:
        icon.notify(_webui_failure_message(port, timed_out), title="WebUI 未启动")
    _refresh_tray_menu(icon)


def _wait_webui_ready(
    proc: Popen, launch_id: int, port: int, auto_open_browser: bool, icon: pystray.Icon | None
) -> None:
    """后台探测健康检查；绝不阻塞 pystray 菜单回调。"""
    global webui_local_url, webui_ready, webui_starting

    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + WEBUI_OPEN_TIMEOUT
    while time.monotonic() < deadline:
        if not _is_current_webui_launch(proc, launch_id):
            return
        if proc.poll() is not None:
            _finish_webui_start_failure(proc, launch_id, port, icon, timed_out=False)
            return
        try:
            response = requests.get(f"{url}/api/health", timeout=1)
            if response.ok and response.json().get("ok") is True:
                with _webui_lock:
                    if webui_process is not proc or _webui_launch_id != launch_id:
                        return
                    webui_local_url = url
                    webui_ready = True
                    webui_starting = False
                _refresh_tray_menu(icon)
                if auto_open_browser:
                    try:
                        webbrowser.open(url)
                    except Exception as e:
                        logger.debug(f"open WebUI browser: {e}")
                return
        except (requests.RequestException, ValueError):
            pass
        time.sleep(WEBUI_HEALTH_CHECK_INTERVAL)

    _finish_webui_start_failure(proc, launch_id, port, icon, timed_out=True)


def _stop_webui(proc: Popen | None) -> None:
    if proc is None:
        return
    try:
        if proc.pid:
            _taskkill_tree(proc.pid)
        proc.kill()
    except Exception as e:
        logger.debug(f"stop WebUI: {e}")


# 启动/停止 FastAPI WebUI
def start_stop_webui(icon: pystray.Icon, item: pystray.MenuItem):
    global webui_process, webui_local_url, webui_ready, webui_starting, _webui_launch_id

    with _webui_lock:
        proc = webui_process
        if proc is not None:
            _webui_launch_id += 1
            webui_process = None
            webui_local_url = ""
            webui_ready = False
            webui_starting = False
        elif webui_starting:
            return
        else:
            _webui_launch_id += 1
            launch_id = _webui_launch_id
            webui_starting = True

    if proc is not None:
        _stop_webui(proc)
        _refresh_tray_menu(icon)
        return

    try:
        port, auto_open_browser = get_webui_launch_settings()
    except ValueError as e:
        with _webui_lock:
            if _webui_launch_id == launch_id:
                webui_starting = False
        icon.notify(str(e), title="WebUI 设置无效")
        _refresh_tray_menu(icon)
        return

    try:
        with open(WEBUI_STDOUT_PATH, "w", encoding="utf-8") as out, open(WEBUI_STDERR_PATH, "w", encoding="utf-8") as err:
            proc = Popen(
                [
                    sys.executable,
                    "-u",
                    "api_server.py",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                stdout=out,
                stderr=err,
                encoding="utf-8",
                cwd=PROJECT_ROOT,
            )
    except OSError as e:
        with _webui_lock:
            if _webui_launch_id == launch_id:
                webui_starting = False
        icon.notify(f"无法启动 WebUI：{e}", title="WebUI 未启动")
        _refresh_tray_menu(icon)
        return

    with _webui_lock:
        if _webui_launch_id != launch_id:
            _stop_webui(proc)
            return
        webui_process = proc
        webui_local_url = ""
        webui_ready = False

    threading.Thread(
        target=_wait_webui_ready,
        args=(proc, launch_id, port, auto_open_browser, icon),
        daemon=True,
        name="wait-webui-ready",
    ).start()
    _refresh_tray_menu(icon)


# 协作式停止录制：写 stop 请求，等子进程在片段边界收尾退出（默认不硬杀）
RECORDING_STOP_GRACE_TIMEOUT = 120  # 秒；ffmpeg 段内会 terminate 当前段以尽快结束

# pystray 图标引用：供 Ctrl+C 强制退出时 stop 托盘循环
tray_icon: pystray.Icon | None = None
_force_shutdown_done = False
# 协作停录进行中（防托盘连点；wait 必须在后台线程，否则 pystray 菜单卡死）
recording_stopping = False
_recording_lock = threading.Lock()


def _taskkill_tree(pid: int) -> None:
    """Windows：强制结束进程树。"""
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception as e:
        logger.debug(f"taskkill {pid} failed: {e}")


def _force_shutdown_children() -> None:
    """托盘退出 / Ctrl+C：强制结束 WebUI 与录制子进程并清理锁状态。

    与「暂停记录」协作式停录不同，此路径必须尽快干净退出。
    """
    global webui_process, webui_local_url, webui_ready, webui_starting, _webui_launch_id
    global recording_process, _force_shutdown_done

    if _force_shutdown_done:
        return
    _force_shutdown_done = True

    with _webui_lock:
        _webui_launch_id += 1
        proc = webui_process
        webui_process = None
        webui_local_url = ""
        webui_ready = False
        webui_starting = False
    _stop_webui(proc)

    # 1) 按 Popen 杀录制进程树
    if recording_process is not None:
        try:
            if recording_process.poll() is None and recording_process.pid:
                _taskkill_tree(recording_process.pid)
            try:
                recording_process.kill()
            except Exception:
                pass
            try:
                recording_process.wait(2)
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"force kill recording_process: {e}")
        recording_process = None

    # 2) 按锁文件 PID 兜底（Popen 丢失 / 双实例残留）
    try:
        utils.kill_recording()
    except Exception as e:
        logger.debug(f"kill_recording: {e}")

    # 3) 清理锁与生命周期状态
    try:
        if os.path.exists(config.record_lock_path):
            os.remove(config.record_lock_path)
    except OSError:
        pass
    try:
        from windrecorder.recording_lifecycle import (
            recording_stop_request_path,
            reset_stop_flags,
            write_status,
        )

        reset_stop_flags()
        try:
            sp = recording_stop_request_path()
            if os.path.exists(sp):
                os.remove(sp)
        except OSError:
            pass
        write_status("idle", phase_message="idle", pid=None, source="force_shutdown")
    except Exception as e:
        logger.debug(f"lifecycle cleanup: {e}")


def _cooperative_stop_worker(proc: Popen, icon: pystray.Icon | None) -> None:
    """后台等待协作停录结束；禁止在 pystray 回调里同步 wait。"""
    global recording_process, recording_stopping

    try:
        proc.wait(RECORDING_STOP_GRACE_TIMEOUT)
        with _recording_lock:
            if recording_process is proc:
                recording_process = None
        if icon is not None:
            try:
                icon.icon = get_tray_icon(state="record_pause")
                icon.title = _t("tray_tip_record_pause")
                # 第二次 Toast：结果通知
                icon.notify(message="录制已停止", title=_t("tray_notify_title_record_pause"))
            except Exception as e:
                logger.debug(f"tray update after stop: {e}")
        logger.info("cooperative stop: recording process exited")
    except subprocess.TimeoutExpired:
        if icon is not None:
            try:
                icon.notify(
                    message="尝试停止超时，录制可能仍在保存中……未强制结束，以免损坏当前片段。",
                    title="停止录制超时",
                )
            except Exception as e:
                logger.debug(f"tray timeout notify: {e}")
        logger.warning("cooperative stop: wait timed out, process may still be saving")
    finally:
        recording_stopping = False
        if icon is not None:
            try:
                icon.update_menu()
            except Exception:
                pass


def _begin_cooperative_stop(icon: pystray.Icon | None) -> None:
    """在托盘回调里只发 stop 请求并启动后台 wait（立即返回）。"""
    global recording_process, recording_stopping
    from windrecorder.recording_lifecycle import request_stop

    with _recording_lock:
        if recording_stopping:
            if icon is not None:
                icon.notify(message="正在尝试停止录制……", title="正在尝试暂停录制")
            return
        proc = recording_process
        if not proc:
            return
        recording_stopping = True

    if icon is not None:
        icon.notify(message="正在尝试停止录制……", title="正在尝试暂停录制")

    request_stop(source="tray")
    try:
        proc.send_signal(signal.CTRL_BREAK_EVENT)
    except Exception as e:
        logger.debug(f"CTRL_BREAK send failed: {e}")

    threading.Thread(
        target=_cooperative_stop_worker,
        args=(proc, icon),
        daemon=True,
        name="cooperative-stop-recording",
    ).start()
    if icon is not None:
        try:
            icon.update_menu()
        except Exception:
            pass


# 开始/停止录制
def start_stop_recording(icon: pystray.Icon | None = None, item: pystray.MenuItem | None = None):
    global recording_process, recording_stopping

    with _recording_lock:
        has_proc = recording_process is not None
        stopping = recording_stopping

    if has_proc or stopping:
        # 已有录制或正在协作停录：异步尝试停止，绝不在回调里 wait
        _begin_cooperative_stop(icon)
    else:
        # 如果录制进程不存在，则启动录制进程
        from windrecorder.recording_lifecycle import reset_stop_flags, write_status

        reset_stop_flags()
        write_status("recording", phase_message="recording", source="tray")
        with open(RECORDING_STDOUT_PATH, "w", encoding="utf-8") as out, open(
            RECORDING_STDERR_PATH, "w", encoding="utf-8"
        ) as err:
            proc = Popen(
                [sys.executable, "-u", "record_screen.py"],
                stdout=out,
                stderr=err,
                encoding="utf-8",
                cwd=PROJECT_ROOT,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
        with _recording_lock:
            recording_process = proc
            recording_stopping = False
        if icon is not None:
            icon.icon = get_tray_icon(state="recording")
            icon.title = _t("tray_tip_record")
            icon.notify(message=_t("tray_notify_text"), title=_t("tray_notify_title"))



# 生成系统托盘菜单
def menu_callback():
    try:
        # 获取可用的新版本（如果有）
        new_version = utils.get_new_version_if_available()
    except requests.ConnectionError:
        new_version = None
    current_version = utils.get_current_version()  # 获取当前版本

    # 返回生成的菜单项列表
    return (
        pystray.MenuItem(
            lambda item: (
                _t("tray_webui_starting")
                if webui_starting
                else (_t("tray_webui_exit") if webui_process else _t("tray_webui_start"))
            ),
            start_stop_webui,
            enabled=lambda item: not webui_starting,
        ),
        pystray.MenuItem(
            lambda item: _t("tray_webui_address").format(address_port=webui_local_url),
            open_webui,
            visible=lambda item: webui_ready,
            default=True,
        ),
        # 开始或停止录制选项（停录中禁用，避免连点；退出始终可用）
        pystray.MenuItem(
            lambda item: (
                "⏳ 正在停止…"
                if recording_stopping
                else (_t("tray_record_stop") if recording_process else _t("tray_record_start"))
            ),
            start_stop_recording,
            enabled=lambda item: not recording_stopping,
        ),
        # 分隔线
        pystray.Menu.SEPARATOR,
        # 更新选项
        pystray.MenuItem(
            lambda item: (
                _t("tray_update_cta").format(version=new_version)
                if new_version is not None
                else _t("tray_version_info").format(version=current_version)
            ),
            update,
            enabled=lambda item: new_version is not None,
        ),
        # 查看更新日志
        pystray.MenuItem(
            _t("tray_updatelog"),
            open_web_changelog,
            visible=lambda item: new_version is not None,
        ),
        # 退出选项
        pystray.MenuItem(_t("tray_exit"), on_exit),
    )


# 处理退出操作（强制：与 Ctrl+C 相同）
def on_exit(icon: pystray.Icon, item: pystray.MenuItem):
    global tray_icon
    tray_icon = icon
    logger.info("tray exit: force shutdown children")
    _force_shutdown_children()
    try:
        icon.stop()
    except Exception as e:
        logger.debug(f"icon.stop: {e}")
    try:
        if os.path.exists(config.tray_lock_path):
            os.remove(config.tray_lock_path)
    except OSError:
        pass
    # 托盘退出也立刻结束进程，避免 pystray 卡在 run
    os._exit(0)


def interrupt_start():
    win_ui.show_popup(_t("tray_text_already_run"), "Windrecorder is already running.", "information")
    sys.exit()


def interrupt_start_no_ffmpeg_and_ffprobe(reason):
    win_ui.show_popup(reason, "Missing dependencies", "information")
    sys.exit()


def hide_cli_window():
    # 隐藏该 CLI 窗口
    subprocess.run("cls", shell=True)
    print()

    timeout_count = 1200
    for i in range(timeout_count):
        print(f"   Trying to hide CLI window... ({i}/{timeout_count})")
        try:
            title = str(pygetwindow.getActiveWindowTitle())
            if "Windrecorder" in title:
                hide_CLI = win32gui.GetForegroundWindow()
                win32gui.ShowWindow(hide_CLI, win32con.SW_HIDE)
                break
        except Exception as e:
            print(f"   -Exception: {e}")
            logger.error(e)
            continue
        finally:
            time.sleep(1)
    print("\n   Hide CLI window fail. Please minimize this window manually.")


def main():
    global tray_icon

    # 启动时加锁，防止重复启动
    while True:
        try:
            tray_lock = FileLock(config.tray_lock_path, str(getpid()), timeout_s=None)
            break
        except LockExistsException:
            with open(config.tray_lock_path, encoding="utf-8") as f:
                check_pid = int(f.read())

            tray_is_running = utils.is_process_running(check_pid, compare_process_name="python.exe")
            if tray_is_running:
                interrupt_start()
            else:
                try:
                    os.remove(config.tray_lock_path)
                except FileNotFoundError:
                    pass

    with tray_lock:
        if os.path.exists(HIDE_CLI_TRIGGER):
            thread_hide_cli_window = threading.Thread(target=hide_cli_window)
            thread_hide_cli_window.start()
        else:
            logger.info("\nRun in CLI mode.\n")

        ff_available, ff_callback = utils.check_ffmpeg_and_ffprobe()
        if not ff_available:
            interrupt_start_no_ffmpeg_and_ffprobe(ff_callback)

        tray_icon_init = get_tray_icon(state="record_pause")
        tray_title_init = _t("tray_tip_record_pause")
        if config.start_recording_on_startup:
            start_stop_recording()
            tray_icon_init = get_tray_icon(state="recording")
            tray_title_init = _t("tray_tip_record")

        def _hard_exit(code: int = 0) -> None:
            """强制结束本进程（pystray 常拦截 SystemExit / 不离开 run）。"""
            _force_shutdown_children()
            # 再删 tray 锁，避免「already running」
            try:
                if os.path.exists(config.tray_lock_path):
                    os.remove(config.tray_lock_path)
            except OSError:
                pass
            os._exit(code)

        def _on_console_interrupt(signum, frame):
            # Ctrl+C / 控制台中断：强制退出（与托盘「退出」相同）
            logger.info(f"console interrupt signal={signum}, force shutdown")
            icon = tray_icon
            if icon is not None:
                try:
                    icon.stop()
                except Exception:
                    pass
            _hard_exit(0)

        for sig_name in ("SIGINT", "SIGTERM"):
            sig = getattr(signal, sig_name, None)
            if sig is None:
                continue
            try:
                signal.signal(sig, _on_console_interrupt)
            except (ValueError, OSError) as e:
                logger.debug(f"cannot install {sig_name}: {e}")

        # Windows 控制台关闭 / Ctrl+C 有时不进 signal.signal；再挂一层
        try:
            import win32api  # type: ignore

            def _win_ctrl_handler(ctrl_type):
                # 0=Ctrl+C, 1=Ctrl+Break, 2=Close, 5=Logoff, 6=Shutdown
                if ctrl_type in (0, 1, 2, 5, 6):
                    logger.info(f"SetConsoleCtrlHandler ctrl_type={ctrl_type}, force shutdown")
                    # 必须尽快 _exit；return True 表示已处理，避免默认继续
                    _hard_exit(0)
                    return True
                return False

            win32api.SetConsoleCtrlHandler(_win_ctrl_handler, True)
        except Exception as e:
            logger.debug(f"SetConsoleCtrlHandler unavailable: {e}")

        tray_icon = pystray.Icon(
            "Windrecorder",
            tray_icon_init,
            title=tray_title_init,
            menu=pystray.Menu(menu_callback),
        )
        try:
            tray_icon.run(setup=setup)
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            # 任意离开 run：确保子进程被强制清理
            _force_shutdown_children()
            try:
                if os.path.exists(config.tray_lock_path):
                    os.remove(config.tray_lock_path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
