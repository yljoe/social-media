@echo off
setlocal

set "ROOT=%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found. Please install Python 3 and add it to PATH.
  echo Download: https://www.python.org/downloads/windows/
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js and add it to PATH.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please make sure Node.js is installed and added to PATH.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

echo Environment check passed.
python --version
node --version
npm --version
echo.

echo Installing backend dependencies...
cd /d "%ROOT%backend"
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Backend dependency install failed.
  pause
  exit /b 1
)

echo Installing frontend dependencies...
cd /d "%ROOT%frontend"
npm install
if errorlevel 1 (
  echo Frontend dependency install failed.
  pause
  exit /b 1
)

echo.
echo Starting backend and frontend...
start "Backend - FastAPI" /D "%ROOT%backend" cmd /k python -m uvicorn app.main:app --reload --port 8000
start "Frontend - Vite" /D "%ROOT%frontend" cmd /k npm run dev

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.

endlocal
