@echo off
setlocal
cd /d "%~dp0"
title Eknowledge Game - HOST
echo ============================================
echo    EKNOWLEDGE GAME - jadi HOST
echo ============================================
echo.

REM --- cek Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js belum keinstall di komputer ini.
  echo     Install dulu dari: https://nodejs.org  ^(pilih versi LTS^)
  echo.
  pause
  exit /b 1
)

REM --- install dependencies kalau belum ada ---
if not exist "node_modules" (
  echo [*] Pertama kali jalan - install dependencies dulu...
  call npm install
  echo.
)

REM --- cari cloudflared ---
set "CF="
for /f "delims=" %%i in ('where cloudflared 2^>nul') do set "CF=%%i"
if not defined CF if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not defined CF (
  echo [X] cloudflared belum keinstall.
  echo     Install dulu, jalankan perintah ini di PowerShell:
  echo         winget install Cloudflare.cloudflared
  echo.
  pause
  exit /b 1
)

echo [*] Menyalakan server game...
start "eknowledge-server" cmd /c "node server.js"

echo [*] Menunggu server siap...
timeout /t 3 >nul

echo.
echo ============================================
echo   Link publik muncul di bawah ini. Cari baris:
echo       https://xxxxxxxx.trycloudflare.com
echo   Share link itu ke grup WA kantor.
echo.
echo   JANGAN tutup jendela ini selama main.
echo   Kalau udah selesai, tutup jendela ini + jendela server.
echo ============================================
echo.
"%CF%" tunnel --url http://localhost:3000

endlocal
