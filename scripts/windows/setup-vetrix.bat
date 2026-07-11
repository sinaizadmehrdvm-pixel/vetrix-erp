@echo off
setlocal
cd /d "%~dp0\..\.."
echo [Vetrix] Checking prerequisites...
where py >nul 2>nul || (echo Python 3.12 is required. Install it from python.org and enable Add Python to PATH.& exit /b 1)
where node >nul 2>nul || (echo Node.js 22 LTS is required. Install it from nodejs.org.& exit /b 1)
echo [Vetrix] Preparing backend...
if not exist "backend\.venv\Scripts\python.exe" py -3.12 -m venv backend\.venv
call backend\.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt || exit /b 1
python -m pip check || exit /b 1
echo [Vetrix] Preparing frontend...
pushd frontend
call npm ci || (popd & exit /b 1)
popd
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo Setup completed successfully.
echo Edit .env before production use, then run scripts\windows\start-vetrix.bat
pause
