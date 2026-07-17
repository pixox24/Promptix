# 项目快捷启动器设计

## 目标

在项目根目录提供一个可双击运行的 Windows 批处理文件，用于启动 Promptix 本地开发环境。

## 启动流程

1. 运行 `docker compose up -d`，确保 PostgreSQL 和 Redis 已启动。
2. 检查 Web（4173）、API（8787）和 Worker 的运行状态；已运行的服务不重复启动。
3. 分别在可见命令窗口启动 API、Worker 和 Web，以便查看实时日志。
4. 显示运营后台地址 `http://localhost:4173/` 与 API 健康检查地址 `http://localhost:8787/health`。

## 约束与错误处理

- 启动器不修改项目配置、数据库或依赖清单。
- Docker 或 npm 不可用时，显示明确错误并以非零状态结束。
- Web 固定使用 4173 端口；API 固定使用 8787 端口。
- 服务窗口由用户关闭；再次运行启动器时只补拉未运行的服务。

## 验证

运行启动器后，确认 Docker Compose 服务健康、Web 首页返回 200、API `/health` 返回 200，并在 Worker 日志中看到 `worker_ready`。
