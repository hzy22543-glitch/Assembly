@echo off
cd /d "%~dp0.." || exit /b 1
chcp 65001 >nul
title CodeBuddy - PM2 Manager
color 0A

:menu
cls
echo ========================================================
echo          CodeBuddy PM2 Service Manager
echo ========================================================
echo.
echo  [1] Start All Services
echo  [2] Stop All Services
echo  [3] Restart All Services
echo  [4] Show Status
echo  [5] Show Logs
echo  [6] Save Process List
echo  [7] Setup Auto Start on Boot
echo  [8] Show Monitor Panel
echo  [0] Exit
echo.
echo ========================================================
set /p choice=Please select [0-8]:
echo.

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto status
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto save
if "%choice%"=="7" goto startup
if "%choice%"=="8" goto monit
if "%choice%"=="0" exit /b

echo [ERROR] Invalid option.
pause
goto menu

:start
echo [*] Starting services...
call npx pm2 delete codebuddy-flask 2>nul
call npx pm2 delete codebuddy-server 2>nul
call npx pm2 start ecosystem.config.cjs
echo.
echo [*] Done. Showing status in 3 seconds...
timeout /t 3 >nul
call npx pm2 status
echo.
pause
goto menu

:stop
echo [*] Stopping all services...
call npx pm2 stop all
echo [OK] All services stopped.
echo.
pause
goto menu

:restart
echo [*] Restarting all services...
call npx pm2 restart all
echo.
echo [*] Done. Showing status in 3 seconds...
timeout /t 3 >nul
call npx pm2 status
echo.
pause
goto menu

:status
call npx pm2 status
echo.
pause
goto menu

:logs
echo [*] Press Ctrl+C to exit logs...
echo.
call npx pm2 logs --lines 50 --nostream
pause
goto menu

:save
echo [*] Saving PM2 process list...
call npx pm2 save
echo [OK] Saved to ~/.pm2/dump.pm2
echo.
pause
goto menu

:startup
echo [*] Generating startup script...
call npx pm2 startup
echo.
echo [OK] Run the above command as Administrator to enable auto-start.
echo.
pause
goto menu

:monit
call npx pm2 monit
goto menu
