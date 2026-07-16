# Promptix

帮助用户发现、浏览、填写变量、保存并使用高质量 AI 图像生成提示词模板。

## 技术栈

- 前台：React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router
- 后端：Hono + PostgreSQL + Redis/BullMQ + 阿里云 OSS
- Monorepo：`apps/web` · `apps/api` · `apps/worker` · `packages/shared`

## 本地运行

### 1. 依赖与基础设施

```bash
npm install
docker compose up -d
```

复制环境变量：

```bash
cp .env.example .env
```

### 2. 初始化数据库

```bash
npm run db:migrate
npm run db:seed
```

种子命令使用 `.env` 中的 `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` 创建首个 owner，并将现有模板写入 PostgreSQL。

### 3. 启动

```bash
# 前台（默认 http://localhost:5173，/api 代理到 8787）
npm run dev:web

# API（http://localhost:8787）
npm run dev:api

# Worker（BullMQ 异步任务）
npm run dev:worker
```

构建：

```bash
npm run build
```

## 页面结构（前台）

| 路径 | 说明 |
|------|------|
| `/` | 发现页 |
| `/library` | 模板库 |
| `/template/:id` | 详情 |
| `/my` | 我的提示词 |
| `/admin/login` | 运营后台登录 |
| `/admin/templates` | 模板 CMS、封面、发布/下架 |
| `/admin/ingest` | 图片反推、文本扩写 |
| `/admin/jobs` | 异步任务与重试 |
| `/admin/providers` | Provider 连接与多 Model、能力及默认用途配置 |

## 阶段 A 能力

- 管理员 JWT HttpOnly Cookie 登录与受保护后台。
- 模板 CRUD、变量编辑、封面上传；无封面发布固定返回 `409 COVER_REQUIRED`。
- 文本扩写、图片反推、生图均通过 BullMQ 异步执行，任务可查询和重试。
- Provider 只保存 Adapter、Base URL、认证方式和密钥环境变量名；一个 Provider 可以管理多个 Model，密钥值不写入数据库。
- Model 独立声明 `text`、`structured_output`、`vision`、`image` 能力，并可分别指定默认文本、默认视觉和默认生图模型。
- 文本、结构化输出、视觉理解和标准同步生图统一使用 Vercel AI SDK 7；OpenAI-compatible、OpenAI、Anthropic、Google 与 DeepSeek 都通过固定 Adapter 工厂创建，不动态加载数据库代码。
- `custom_65535_async` 保留显式提交与轮询协议，保存 `providerJobId`、过期时间、成本和尺寸档位等厂商元数据。
- 新任务以 `modelId` 选型并同步保存 `providerId`；仅含旧 `providerId` 的历史任务仍可解析和重试。
- 已发布模板由公开 API `/api/templates` 提供给前台；API 不可见时开发环境回退静态模板。
- OSS 永久对象使用 `public/`，试跑/输入使用 `temp/`；`temp/` 应配置 7 天生命周期。

完整部署、备份、密钥轮换与故障排查见 [运维手册](docs/ops.md)。

## 设计与计划

- [设计文档](docs/plans/2026-07-16-promptix-admin-oss-design.md)
- [实现计划](docs/plans/2026-07-16-promptix-admin-oss-implementation-plan.md)

## MVP 边界

已实现：浏览搜索、筛选排序、变量化 Prompt、复制、收藏/最近/草稿（localStorage）。

阶段 A 已实现：运营后台、Postgres、OSS、本地开发存储回退、异步生图/反推/扩写入库与公开 API。

## 环境要求

- Node.js 22（`.nvmrc` 固定为 `22`，项目 engine 要求 `>=22.0.0`）。
- Docker Desktop 或兼容 Docker Engine（用于 PostgreSQL/Redis）。
- 生产环境必须设置强 `JWT_SECRET`、`COOKIE_SECURE=true`，并使用 HTTPS。

## Provider / Model 快速配置

1. 在 `.env` 填写实际密钥，例如 `DEEPSEEK_API_KEY` 或 `IMAGE_65535_API_KEY`。
2. 在 `/admin/providers` 创建 Provider；数据库只保存上述环境变量名。
3. 在该 Provider 下添加一个或多个 Model，声明真实能力和调用默认值。
4. 为业务至少配置一个默认文本模型；需要生图或图片反推时，再分别配置默认生图、默认视觉模型。

升级已有部署前先备份 PostgreSQL，再执行 `npm run db:migrate`。迁移会新增 `provider_models` 和 `generation_jobs.model_id` 并回填旧数据，不删除旧 Provider/Job 兼容字段。详细验证与回滚步骤见 [运维手册](docs/ops.md)。
