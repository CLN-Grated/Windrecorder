@echo off
echo Loading extension, please stand by.
echo.

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
chcp 65001
cls

uv run --locked python "%~dp0\index_img_embedding_for_all_videofiles.py"
pause
