# 项目快捷启动器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目根目录提供一个可双击运行、幂等地拉起本地 Web、API、Worker 与 Docker 依赖的 Windows 启动器。

**Architecture:** `启动项目.bat` 以自身所在目录作为项目根目录，先验证 `docker` 与 `npm`，再启动 Docker Compose。它用端口检查判断 Web/API 是否已运行，并用 PowerShell 查询 Node 命令行判断 Worker 是否已运行；仅对缺失服务创建可见日志窗口。

**Tech Stack:** Windows Batch、PowerShell、Docker Compose、npm workspaces。

## Global Constraints

- 创建文件必须位于项目根目录，名称为 `启动项目.bat`。
- Web 固定监听 4173；API 固定监听 8787。
- 使用 `docker compose up -d` 启动 PostgreSQL 与 Redis。
- 不修改 `.env`、数据库、`package.json` 或锁文件。
- 已运行的 Web、API 或 Worker 不得重复启动。

---

### Task 1: Create and verify the double-click launcher

**Files:**
- Create: `启动项目.bat`
- Test: manual commands in the project root

**Interfaces:**
- Consumes: `docker compose`, `npm run dev:api`, `npm run dev:worker`, and `npm run dev -w @promptix/web -- --host 0.0.0.0 --port 4173 --strictPort`.
- Produces: three named `cmd` windows only when their corresponding service is absent.

- [ ] **Step 1: Verify the expected failure before creating the launcher.**

Run:

```powershell
cmd /c "启动项目.bat"
```

Expected: Windows reports that `启动项目.bat` is not recognized or cannot be found.

- [ ] **Step 2: Create the launcher.**

Create `启动项目.bat` with this content:

```bat
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
  start "Promptix API" cmd /k "cd /d ""%~dp0"" ^&^& npm run dev:api"
) else (
  echo [2/4] API is already running on 8787.
)

call :worker_running
if errorlevel 1 (
  echo [3/4] Starting Worker...
  start "Promptix Worker" cmd /k "cd /d ""%~dp0"" ^&^& npm run dev:worker"
) else (
  echo [3/4] Worker is already running.
)

call :port_open 4173
if errorlevel 1 (
  echo [4/4] Starting Web on http://localhost:4173...
  start "Promptix Web" cmd /k "cd /d ""%~dp0"" ^&^& npm run dev -w @promptix/web -- --host 0.0.0.0 --port 4173 --strictPort"
) else (
  echo [4/4] Web is already running on 4173.
)

echo.
echo Promptix is available at http://localhost:4173/
echo API health: http://localhost:8787/health
exit /b 0

:port_open
powershell -NoProfile -Command "exit -not (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue)"
exit /b %errorlevel%

:worker_running
powershell -NoProfile -Command "$worker = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" ^| Where-Object { $_.CommandLine -match 'npm-cli\.js.*run dev:worker' }; exit -not [bool]$worker"
exit /b %errorlevel%
```

- [ ] **Step 3: Run the launcher and verify a clean startup.**

Run:

```powershell
cmd /c "启动项目.bat"
Invoke-WebRequest http://localhost:4173/ -UseBasicParsing
Invoke-WebRequest http://localhost:8787/health -UseBasicParsing
```

Expected: the batch command exits 0; both HTTP requests return status 200; the Worker window logs `worker_ready`.

- [ ] **Step 4: Verify idempotence.**

Run:

```powershell
cmd /c "启动项目.bat"
```

Expected: output says that API, Worker, and Web are already running; no new Promptix service windows are opened.

- [ ] **Step 5: Check the tracked diff and commit only the launcher.**

Run:

```powershell
git diff --check -- 启动项目.bat
git add -- 启动项目.bat
git commit -m "chore: add project launcher"
```

Expected: the whitespace check passes and the commit includes only `启动项目.bat`.
