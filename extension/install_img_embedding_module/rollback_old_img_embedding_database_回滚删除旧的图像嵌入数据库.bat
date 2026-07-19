@echo off
echo Loading extension, please stand by.
echo.

cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
chcp 65001

:start_rollback
uv run --locked python _rollback_old_imgemb_db.py

@REM -------------------------------------------------
:finish
echo.
echo   The rollback script has been completed. 已执行完回滚脚本。
echo.
pause
exit
