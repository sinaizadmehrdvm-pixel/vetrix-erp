@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "backend\.venv\Scripts\python.exe" (
  echo Vetrix is not installed yet.
  echo Run scripts\windows\setup-vetrix.bat first.
  pause
  exit /b 1
)
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
  )
)
start "Vetrix Backend" cmd /k "cd /d %CD%\backend && .venv\Scripts\activate.bat && python -m uvicorn main:app --host 127.0.0.1 --port 8001"
start "Vetrix Frontend" cmd /k "cd /d %CD%\frontend && npm run dev -- --host 127.0.0.1 --port 5173"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5173"
echo Vetrix started. Keep both opened terminal windows running.
