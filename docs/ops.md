# Promptix 运维手册

## 进程与依赖

- `web`：Vite/静态站点，生产环境将 `/api` 与 `/uploads` 反代到 API。
- `api`：Hono，默认端口 `8787`。
- `worker`：BullMQ consumer，必须与 API 使用相同的 `DATABASE_URL`、`REDIS_URL` 和 Provider 密钥环境变量。
- PostgreSQL 16 保存业务数据；Redis 7 只保存任务队列；图片默认进入阿里云 OSS。

## 首次部署

1. 从 `.env.example` 创建 `.env`，替换 JWT、管理员密码、数据库和 OSS 凭据。
2. `docker compose up -d`。
3. `npm ci && npm run db:migrate && npm run db:seed`。
4. 分别启动 API、Worker 和 Web；生产环境建议使用 systemd、PM2 或容器编排守护。
5. 在 OSS 控制台为 `temp/` 前缀配置 7 天后删除的生命周期规则。

`STORAGE_DRIVER=auto` 在 OSS 凭据完整时使用 OSS，否则回退到本地 `apps/api/.tmp/uploads`，该回退只适合开发与单机验收。

## 备份与恢复

- 每日执行 `pg_dump -Fc promptix > promptix-YYYYMMDD.dump`，至少保留 14 天并异地存储。
- 恢复前停止 API/Worker 写入，创建空库后执行 `pg_restore --clean --if-exists -d promptix backup.dump`。
- Redis 队列不作为业务真相来源；恢复 PG 后将需要重跑的 `failed/cancelled` 任务从后台手动重试。
- OSS permanent (`public/`) 建议开启版本控制；`temp/` 不备份。

## 密钥轮换

1. 新建 OSS RAM 密钥或模型 Provider 密钥。
2. 更新进程环境变量并滚动重启 API/Worker。
3. 验证上传及 noop/模型任务后吊销旧密钥。
4. 轮换 `JWT_SECRET` 会使现有管理会话全部失效，应提前通知运营人员。

## 故障排查

- API `/api/health` 正常但业务 500：检查 `DATABASE_URL` 与迁移是否执行。
- 新任务返回 `QUEUE_UNAVAILABLE`：检查 Redis、`REDIS_URL` 和防火墙。
- 任务长期 queued：Worker 未运行或队列名不一致；查看 Worker 的 JSON 日志 `worker_ready`。
- 任务 failed：后台任务中心查看 `errorMessage`，确认 Provider Base URL、模型名及密钥环境变量；修复后点击重试。
- 图片无法显示：确认 OSS 公读/CDN URL，或本地模式下 `/uploads` 已反代到 API。

## 安全基线

- `.env` 不进入版本库；Provider 只保存密钥的环境变量名。
- 管理端 Cookie 使用 HttpOnly；生产必须设置 `COOKIE_SECURE=true` 并启用 HTTPS。
- 管理上传限制为图片 MIME 且最大 10MB。
- 定期审计管理员账号、RAM 最小权限和失败任务日志。
