@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "MODE=start"
if /i "%~1"=="restart" set "MODE=restart"
if not "%~1"=="" if /i not "%~1"=="restart" (
  echo Usage: %~nx0 [restart]
  exit /b 2
)

where docker >nul 2>nul || (
  echo [ERROR] Docker is not available in PATH.
  exit /b 1
)
where node >nul 2>nul || (
  echo [ERROR] Node.js is not available in PATH.
  exit /b 1
)
where npm.cmd >nul 2>nul || (
  echo [ERROR] npm is not available in PATH.
  exit /b 1
)
where curl.exe >nul 2>nul || (
  echo [ERROR] curl.exe is not available in PATH.
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
node -e "const [M,m]=process.versions.node.split('.').map(Number);process.exit((M===20&&m>=19)||(M===22&&m>=12)||M>22?0:1)" >nul 2>nul
if errorlevel 1 echo [WARN] Node.js %NODE_VERSION% is below Vite's recommended version. Use Node 20.19+ or 22.12+.

echo [1/6] Checking project dependencies...
call npm.cmd ls --depth=0 >nul 2>nul
if errorlevel 1 (
  echo       Restoring dependencies from package-lock.json...
  call npm.cmd install --registry=https://registry.npmjs.org || (
    echo [ERROR] npm install failed.
    exit /b 1
  )
) else (
  echo       Dependencies are ready.
)
node --input-type=module -e "import 'rolldown'" >nul 2>nul
if errorlevel 1 (
  echo       Repairing the Vite Windows native binding...
  call npm.cmd install --no-save @rolldown/binding-win32-x64-msvc@1.1.5 --registry=https://registry.npmjs.org || (
    echo [ERROR] Vite native binding repair failed.
    exit /b 1
  )
)

if /i "%MODE%"=="restart" (
  echo [2/6] Stopping existing Promptix services...
  call :stop_services
) else (
  echo [2/6] Keeping healthy Promptix services already running.
)

echo [3/6] Starting PostgreSQL and Redis...
docker compose up -d || (
  echo [ERROR] Docker Compose failed to start.
  exit /b 1
)
call :wait_docker
if errorlevel 1 (
  echo [ERROR] PostgreSQL or Redis did not become ready in time.
  docker compose ps
  exit /b 1
)

call :port_open 8787
if errorlevel 1 (
  echo [4/6] Starting API on http://localhost:8787...
  start "Promptix API" /d "%~dp0" cmd /k "npm.cmd run dev:api"
) else (
  echo [4/6] API is already running on 8787.
)

call :worker_running
if errorlevel 1 (
  echo [5/6] Starting Worker...
  start "Promptix Worker" /d "%~dp0" cmd /k "npm.cmd run dev:worker"
) else (
  echo [5/6] Worker is already running.
)

call :port_open 4173
if errorlevel 1 (
  echo [6/6] Starting Web on http://localhost:4173...
  start "Promptix Web" /d "%~dp0" cmd /k "npm.cmd run dev -w @promptix/web -- --host 0.0.0.0 --port 4173 --strictPort"
) else (
  echo [6/6] Web is already running on 4173.
)

echo       Waiting for API health...
call :wait_http "http://127.0.0.1:8787/health"
if errorlevel 1 (
  echo [ERROR] API health check timed out. Review the Promptix API window.
  exit /b 1
)

echo       Waiting for Web...
call :wait_http "http://127.0.0.1:4173/"
if errorlevel 1 (
  echo [ERROR] Web health check timed out. Review the Promptix Web window.
  exit /b 1
)

echo.
echo Promptix is ready.
echo Web: http://localhost:4173/
echo API health: http://localhost:8787/health
echo Run "%~nx0 restart" to restart all Promptix services.
exit /b 0

:stop_services
taskkill /FI "WINDOWTITLE eq Promptix API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Promptix Worker*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Promptix Web*" /T /F >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$roots=Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'cmd.exe','node.exe' -and ($_.CommandLine -match '(npm-cli\.js|npm\.cmd).*run dev:(api|worker)' -or $_.CommandLine -match '(npm-cli\.js|npm\.cmd).*run dev -w @promptix/(api|web|worker)') }; foreach($root in $roots){ $null = & taskkill.exe /PID $root.ProcessId /T /F }; $ports=4173,8787; Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In $ports | ForEach-Object { $null = & taskkill.exe /PID $_.OwningProcess /T /F }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 20;$i++){if(-not (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In 4173,8787)){exit 0};Start-Sleep -Milliseconds 250};exit 1"
exit /b %errorlevel%

:wait_docker
powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 30;$i++){ $services=@(docker compose ps --status running --services); if($services -contains 'postgres' -and $services -contains 'redis'){exit 0}; Start-Sleep -Seconds 1 }; exit 1"
exit /b %errorlevel%

:port_open
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:worker_running
powershell -NoProfile -ExecutionPolicy Bypass -Command "$worker=Get-CimInstance Win32_Process;foreach($process in $worker){if($process.Name -eq 'node.exe' -and ($process.CommandLine -match 'npm-cli\.js.*run dev:worker' -or $process.CommandLine -match 'npm-cli\.js.*run dev -w @promptix/worker')){exit 0}};exit 1"
exit /b %errorlevel%

:wait_http
for /l %%I in (1,1,60) do (
  curl.exe --fail --silent --max-time 2 "%~1" >nul 2>nul && exit /b 0
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1"
)
exit /b 1
