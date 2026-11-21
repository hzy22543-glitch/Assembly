@echo off
cd /d "%~dp0.." || exit /b 1
chcp 65001 >nul
title CodeBuddy Start
color 0A

echo ========================================================
echo          CodeBuddy Assembly Learning Platform
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first!
    pause
    exit /b
)

:: 2. Check Python 3
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3 first!
    pause
    exit /b
)

:: 3. Install Node dependencies
if not exist "node_modules\" (
    echo [*] Installing Node.js dependencies...
    call npm ci || goto failed
)

if not exist "server\node_modules\" (
    echo [*] Installing server dependencies...
    call npm ci --prefix server || goto failed
)

:: 4. Install Python sandbox dependencies
echo [*] Installing Python dependencies...
call python -m pip install -r sandbox\requirements.txt || goto failed

if not exist "dist\index.html" (
    call npm run build || goto failed
)

:: 5. Report optional compiler setup
if not exist "sandbox\tools\nasm.exe" (
    where nasm >nul 2>nul || echo [INFO] For optional compiler setup, see sandbox\tools\HOW_TO_INSTALL.txt.
)

echo.
echo ========================================================
echo All services ready. Starting now...
echo ========================================================
echo.

:: Flask Sandbox (port 5000)
start "CodeBuddy - Flask Sandbox (5000)" cmd /c "cd sandbox && python api_endpoint.py"

:: Node.js API + Production Frontend (port 3001)
start "CodeBuddy - Production Server (3001)" cmd /c "cd server && node server.js"

:: Frontend Vite Dev Server (port 3000)
:: Disabled for production to release server memory
:: start "CodeBuddy - Frontend (3000)" cmd /c "npm run dev"

echo.
echo All windows launched!
echo.
pause
exit /b 0

:failed
echo [ERROR] Setup failed. See the output above.
pause
exit /b 1

