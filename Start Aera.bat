@echo off
title Aera
cd /d "%~dp0"
echo Starting Aera... this takes a few seconds the first time.
echo Do NOT close this window while you are using the app.
echo When you are done, just close this window to stop it.
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000"
call npm run dev
