@echo off
setlocal
title The Lost Light - dev
cd /d "%~dp0"

echo.
echo  === The Lost Light - local startup ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install Node 22.13 or newer from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  [1/4] Installing root dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
) else (
  echo  [1/4] Root dependencies present.
)

if not exist "backend\node_modules\" (
  echo  [2/4] Installing backend dependencies...
  call npm install --prefix backend --no-audit --no-fund
  if errorlevel 1 goto :fail
) else (
  echo  [2/4] Backend dependencies present.
)

if not exist "frontend\node_modules\" (
  echo  [3/4] Installing frontend dependencies...
  call npm install --prefix frontend --no-audit --no-fund
  if errorlevel 1 goto :fail
) else (
  echo  [3/4] Frontend dependencies present.
)

echo  [4/4] Initialising database (idempotent)...
call npm run db:init --prefix backend
if errorlevel 1 goto :fail

echo.
echo  Starting API (http://localhost:4000) and web (http://localhost:5173)...
echo  Press Ctrl+C to stop both.
echo.
call npm run dev
exit /b %errorlevel%

:fail
echo.
echo  [ERROR] Startup failed. See output above.
pause
exit /b 1
