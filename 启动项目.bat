@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where docker >nul 2>nul || (
  echo [ERROR] Docker is not available in PATH.
  exit /b 1
)
where npm >nul 2>nul || (
  echo [ERROR] npm is not available in PATH.
  exit /b 1
)

echo [1/4] Starting PostgreSQL and Redis...
docker compose up -d || exit /b 1

call :port_open 8787
if errorlevel 1 (
  echo [2/4] Starting API on http://localhost:8787...
  start "Promptix API" /d "%~dp0" cmd /k "npm run dev:api"
) else (
  echo [2/4] API is already running on 8787.
)

call :worker_running
if errorlevel 1 (
  echo [3/4] Starting Worker...
  start "Promptix Worker" /d "%~dp0" cmd /k "npm run dev:worker"
) else (
  echo [3/4] Worker is already running.
)

call :port_open 4173
if errorlevel 1 (
  echo [4/4] Starting Web on http://localhost:4173...
  start "Promptix Web" /d "%~dp0" cmd /k "npm run dev -w @promptix/web -- --host 0.0.0.0 --port 4173 --strictPort"
) else (
  echo [4/4] Web is already running on 4173.
)

echo.
echo Promptix is available at http://localhost:4173/
echo API health: http://localhost:8787/health
exit /b 0

:port_open
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:worker_running
powershell -NoProfile -Command "$worker = Get-CimInstance Win32_Process; foreach ($process in $worker) { if ($process.Name -eq 'node.exe' -and $process.CommandLine -match 'npm-cli\.js.*run dev:worker') { exit 0 } }; exit 1"
exit /b %errorlevel%
