@echo off
setlocal
cd /d "%~dp0"

echo.
echo ================================
echo Starting GPI 2.9
echo ================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo.
  echo Install Node.js LTS first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo.
  echo Install Node.js LTS first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dependencies are not installed yet.
  echo Running first install now...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed.
    echo Check the error message above.
    echo.
    pause
    exit /b 1
  )
)

echo Closing the last GPI browser tab will stop GPI after 10 seconds.
echo You can also close this window to stop GPI.
echo.
echo The browser will open automatically:
echo http://127.0.0.1:8787
echo.
call npm run dev -- --open
if errorlevel 1 (
  echo.
  echo GPI stopped with an error.
  echo Check the error message above.
  echo.
  pause
  exit /b 1
)

echo.
echo GPI stopped.
echo.
exit /b 0
