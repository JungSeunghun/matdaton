@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto install_node

node -e "process.exit(process.versions.node.localeCompare('20.9.0', undefined, { numeric: true }) >= 0 ? 0 : 1)"
if errorlevel 1 goto install_node
goto run_app

:install_node
where winget >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.9 or newer is required.
  echo Install it from https://nodejs.org and run this file again.
  goto failed
)

echo Installing Node.js LTS...
winget install --exact --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto failed
set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was installed. Restart this file to continue.
  goto failed
)

:run_app
echo Node.js and npm versions:
node --version
call npm --version

echo Installing dependencies...
call npm ci
if errorlevel 1 goto failed

echo Starting the development server at http://localhost:3000
call npm run dev
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Setup or startup failed.
pause
exit /b 1