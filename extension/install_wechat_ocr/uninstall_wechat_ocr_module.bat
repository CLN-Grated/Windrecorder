@echo off
echo Loading extension, please stand by.
echo.

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
chcp 65001

:start_install
cls
echo.
echo   Make sure to exit windrecorder before uninstallation.
echo   卸载前请确保退出了 捕风记录仪。
echo.
echo   Enter Y and press Enter to uninstall WeChat OCR module.
echo   输入 Y 后回车卸载 WeChat OCR 模块。
echo.
echo   ================================================================================
echo.
set /p choice=   Please enter the options and press Enter:

if /I "%choice%"=="Y" (
    echo Uninstalling...
    goto uninstall_module
)

goto start_install


@REM -------------------------------------------------
:uninstall_module
cd /d "%~dp0\..\.."
uv pip uninstall --python ".venv" wechat-ocr
cd /d "%~dp0"
goto :finish


@REM -------------------------------------------------
:finish
uv run --locked python _uninstall.py
echo.
echo   The uninstallation script has been completed. 已执行完卸载脚本。
echo.
pause
exit
