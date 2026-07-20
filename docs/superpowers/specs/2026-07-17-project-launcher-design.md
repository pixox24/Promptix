# 项目快捷启动器设计

## 目标

在项目根目录提供一个可双击运行的 Windows 批处理文件，用于启动 Promptix 本地开发环境。

## 启动流程

1. 检查 Docker、Node.js 和 npm。Node.js 必须满足当前前端工具链要求：`20.19+` 或 `22.12+`，不满足时停止并显示升级提示。
2. 使用 `npm ls --depth=0` 检查依赖树；依赖缺失或版本不匹配时执行一次 `npm install`，安装失败则停止。
3. 运行 `docker compose up -d`，并等待 PostgreSQL 和 Redis 进入 healthy/running 状态；超时或失败时停止。
4. 检查 Web（4173）、API（8787）和 Worker 的运行状态；已运行的服务不重复启动。Worker 检测同时识别 `dev:worker` 和 `npm run dev -w @promptix/worker` 两种命令行。
5. 分别在可见命令窗口启动 API、Worker 和 Web，以便查看实时日志。
6. 轮询 Web 首页与 API `/health`。只有两者均返回 HTTP 200 后，才显示项目可用；超时则以非零状态结束并提示用户查看对应服务窗口。

## 约束与错误处理

- 启动器不修改项目配置和数据库；仅在依赖树不完整时按照锁文件恢复本地依赖。
- Docker 或 npm 不可用时，显示明确错误并以非零状态结束。
- Web 固定使用 4173 端口；API 固定使用 8787 端口。
- 服务窗口由用户关闭；再次运行启动器时只补拉未运行的服务。
- 所有等待均使用有限次数的状态轮询，避免脚本永久挂起。

## 验证

使用独立的 PowerShell 验证脚本从外部观察启动器行为，覆盖：

1. 静态检查启动器包含版本、依赖、Docker、Worker 和 HTTP 健康检查。
2. 在服务已运行时再次启动，不产生新的 API、Web 或 Worker 进程。
3. 在服务未运行时执行启动器，确认 Docker Compose 服务健康、Web 首页返回 200、API `/health` 返回 200，并确认恰有一个 Worker 开发进程。
4. 失败路径返回非零退出码，成功路径返回零退出码。
