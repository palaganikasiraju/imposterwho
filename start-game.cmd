@echo off
set "NODE_DIR=%LOCALAPPDATA%\node-portable\node-v24.20.0-win-x64"
if not exist "%NODE_DIR%\npm.cmd" (
  echo Node.js portable installation was not found.
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"
call "%NODE_DIR%\npm.cmd" run dev
pause
