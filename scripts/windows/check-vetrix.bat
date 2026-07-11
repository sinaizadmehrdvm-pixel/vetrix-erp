@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "backend\.venv\Scripts\python.exe" (
  echo Run setup-vetrix.bat first.
  exit /b 1
)
echo [1/5] Backend dependencies
call backend\.venv\Scripts\activate.bat
python -m pip check || exit /b 1
echo [2/5] Backend tests
pushd backend
python -m unittest discover -s tests -v || (popd & exit /b 1)
python -m compileall -q . || (popd & exit /b 1)
popd
echo [3/5] Frontend dependency audit
pushd frontend
call npm audit --audit-level=high || (popd & exit /b 1)
echo [4/5] Route and API audits
call npm run audit:fetch || (popd & exit /b 1)
call npm run audit:routes || (popd & exit /b 1)
echo [5/5] Production build
call npm run build || (popd & exit /b 1)
popd
echo.
echo All Vetrix release checks passed.
pause
