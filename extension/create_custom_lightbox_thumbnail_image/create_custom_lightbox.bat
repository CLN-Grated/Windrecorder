@echo off
echo Loading extension, please stand by.
echo.

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
chcp 65001
cls
cd ..
cd ..

:: extension code below
title Create custom lightbox thumbnail - windrecorder
uv run --locked streamlit run "extension\create_custom_lightbox_thumbnail_image\_webui.py"
pause
