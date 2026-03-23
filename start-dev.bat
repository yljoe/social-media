@echo off
setlocal

set "ROOT=%~dp0"

echo Starting backend and frontend...
start "Backend - FastAPI" /D "%ROOT%backend" cmd /k python -m uvicorn app.main:app --reload --port 8000
start "Frontend - Vite" /D "%ROOT%frontend" cmd /k npm run dev

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.

endlocal
