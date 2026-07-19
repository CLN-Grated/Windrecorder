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
title LLM search and summary - AI-based natural language search - windrecorder
uv run --locked streamlit run "extension\LLM_search_and_summary\_webui.py"
pause
