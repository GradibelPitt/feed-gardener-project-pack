@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Feeder needs Node.js 22.13 or newer. See README.md.
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 (
  echo Feeder could not start. Check the error above.
  pause
  exit /b 1
)
