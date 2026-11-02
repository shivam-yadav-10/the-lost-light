@echo off
rem The Lost Light: fake-time test server (separate DB, free ports picked automatically).
rem Usage: test-server.bat [--now=2026-11-10T10:00:00Z] [--keep] [--api-port=4100] [--web-port=5180]
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH. Install Node 22.13+ and try again.
  pause
  exit /b 1
)

if not exist "backend\node_modules" call npm install --prefix backend || goto :fail
if not exist "frontend\node_modules" call npm install --prefix frontend || goto :fail

node scripts\test-server.mjs %*
exit /b %errorlevel%

:fail
echo Dependency installation failed.
pause
exit /b 1
