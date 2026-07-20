@echo off
title Windrecorder - installing dependence and updating
mode con cols=150 lines=50
setlocal EnableExtensions

cd /d "%~dp0"
set "PROJECT_ROOT=%cd%"

echo -git: updating repository
git pull
if errorlevel 1 (
    echo [ERROR] git pull failed.
    goto fail
)

call :ensure_uv
if errorlevel 1 goto fail

call :detect_installed_extras

echo -preparing Python, virtual environment, and dependencies with uv
if defined UV_EXTRAS echo -restoring previously installed optional modules
color 0e
title Windrecorder - Quick Setup
uv run --locked %UV_EXTRAS% "%PROJECT_ROOT%\onboard_setting.py"
if errorlevel 1 (
    echo [ERROR] onboard setup failed.
    goto fail
)

echo.
echo Installation finished.
pause
exit /b 0

:fail
echo.
echo Installation stopped due to an error.
pause
exit /b 1

:detect_installed_extras
set "UV_EXTRAS="
if not exist "%PROJECT_ROOT%\.venv\Scripts\python.exe" exit /b 0

call :detect_extra "paddle-ocr" "rapidocr-onnxruntime"
call :detect_extra "wechat-ocr" "wechat-ocr"
call :detect_extra "img-embedding" "uform"
exit /b 0

:detect_extra
"%PROJECT_ROOT%\.venv\Scripts\python.exe" -c "from importlib.metadata import version; version('%~2')" >nul 2>nul
if not errorlevel 1 set "UV_EXTRAS=%UV_EXTRAS% --extra %~1"
exit /b 0

:ensure_uv
where uv >nul 2>nul
if not errorlevel 1 exit /b 0

rem Official standalone installer default location
if exist "%USERPROFILE%\.local\bin\uv.exe" (
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    where uv >nul 2>nul
    if not errorlevel 1 exit /b 0
)

echo -installing uv
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
if errorlevel 1 (
    echo [ERROR] Failed to download/install uv.
    exit /b 1
)

if exist "%USERPROFILE%\.local\bin\uv.exe" set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv was installed but is not on PATH. Open a new terminal, or add %%USERPROFILE%%\.local\bin to PATH.
    exit /b 1
)
exit /b 0
