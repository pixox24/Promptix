# Promptix 阶段 A 实现计划

**日期：** 2026-07-16  
**依据设计：** [2026-07-16-promptix-admin-oss-design.md](./2026-07-16-promptix-admin-oss-design.md)  
**状态：** 待执行  

---

## 0. 怎么用这份计划

| 项 | 约定 |
|----|------|
| 执行顺序 | 严格按 PR-01 → PR-12；同 PR 内任务可微调顺序 |
| 分支策略 | 从 `main` 拉 `feat/stage-a-m0-infra` 等；**每个 PR 可独立合并** |
| 验收 | 每个 PR 末尾有「完成定义 / 验证命令」；合并前本地或 CI 跑通 |
| 不做 | 设计文档 §1.3 / §阶段 B（用户生图、完整 i18n UI） |
| 技术默认（实现时可替换，需在 PR 说明） | API: **Hono + Node**；ORM: **Drizzle**；队列: **BullMQ + Redis**；鉴权: **JWT HttpOnly Cookie** |

### 目标仓库形态（完成后）

```text
Promptix/
  apps/web/                 # 现有 Vite React（迁入）+ /admin
  apps/api/                 # Hono HTTP
  apps/worker/              # BullMQ consumer（可 npm script 同机启动）
  packages/shared/          # zod types + TemplateDraft schema
  docker-compose.yml        # postgres + redis
  docs/plans/               # 设计与本计划
  package.json              # npm workspaces 根
```

### 依赖关系总图

```text
PR-01 基建 monorepo+compose
  └─► PR-02 DB schema + migrations
        └─► PR-03 API 骨架 + 鉴权 + OSS 客户端
              ├─► PR-04 管理端壳 + 登录
              │     └─► PR-05 模板 CMS CRUD + 发布校验
              │           └─► PR-06 封面上传绑定
              ├─► PR-07 队列 + Worker 骨架
              │     ├─► PR-08 Provider 配置 + LLM structure 任务
              │     │     └─► PR-09 管理端：反推/扩写 UI
              │     └─► PR-10 生图任务 + 封面闭环
              └─► PR-11 前台接公开 API
                    └─► PR-12 种子数据 + 文档硬化
```

---

## PR-01 — Monorepo 与本地基础设施（M0 前半）

**目标：** 可 `docker compose up` 起 PG/Redis；npm workspaces 能 build/dev 占位包。  
**分支建议：** `feat/stage-a-pr01-monorepo`

### 任务

1. **根 workspace**
   - 根 `package.json`：`"workspaces": ["apps/*", "packages/*"]`
   - 将现有 Vite 应用移到 `apps/web`（保留 git 历史可用 `git mv`）
   - 更新路径：README 本地运行改为 `npm run dev -w web` 等

2. **占位包**
   - `packages/shared`：导出空 `index.ts` + `package.json` name `@promptix/shared`
   - `apps/api`：Hono `GET /health` → `{ ok: true }`
   - `apps/worker`：console 心跳占位（尚未接队列）

3. **Docker Compose**
   - `postgres:16` 端口 5432，volume，用户/库名 `promptix`
   - `redis:7` 端口 6379
   - 根 `.env.example`：`DATABASE_URL` `REDIS_URL` `PORT` 等（无真实密钥）

4. **脚本**
   - 根：`dev:web` `dev:api` `dev:worker` `dev`（concurrently 可选）
   - `apps/web` vite proxy：`/api` → `http://localhost:8787`（或 API 端口）

### 完成定义

- [ ] `docker compose up -d` 后 PG/Redis healthy  
- [ ] `npm run dev -w api` 访问 health 200  
- [ ] `npm run dev -w web` 前台页面与迁移前一致  

### 验证

```bash
docker compose up -d
npm install
npm run dev -w api   # curl /health
npm run dev -w web   # 打开原首页
```

### 风险

- Windows 路径与 `git mv`；先保证 web 能跑再改其它包  

---

## PR-02 — Postgres Schema 与迁移（M0）

**目标：** 设计文档中的表全部可 migrate；含 i18n/封面字段。  
**依赖：** PR-01  
**分支：** `feat/stage-a-pr02-schema`

### 任务

1. 在 `apps/api` 接入 Drizzle（或选定 ORM）+ `drizzle-kit`
2. 定义表（见设计 §4）：
   - `admin_users`
   - `prompt_templates`（含 `cover_*` `locale` `i18n` `status` `source`…）
   - `template_assets`
   - `providers`
   - `generation_jobs`
   - `media_objects`
3. 索引按设计 §4.10
4. `npm run db:migrate` / `db:generate` 脚本
5. `packages/shared`：导出与 DB/API 对齐的 TypeScript 类型 + zod（`PromptVariable` `TemplateDraft` `TemplateStatus`）

### 完成定义

- [ ] 空库一键 migrate 成功  
- [ ] 类型与 zod 可从 web/api import（workspace 引用）  

### 验证

```bash
docker compose up -d
npm run db:migrate -w api
# psql 或 drizzle-kit studio 确认表存在
```

---

## PR-03 — API 骨架、鉴权、OSS 客户端（M0/M1 基础）

**目标：** 管理员可登录拿 Cookie；OSS 可上传/删除测通；统一错误格式。  
**依赖：** PR-02  
**分支：** `feat/stage-a-pr03-api-auth-oss`

### 任务

1. **配置模块**：zod 校验 env（`DATABASE_URL` `JWT_SECRET` `OSS_*` `REDIS_URL` `COOKIE_SECURE`）
2. **鉴权**
   - `POST /api/admin/auth/login` `{ email, password }` → Set-Cookie HttpOnly
   - `POST /api/admin/auth/logout`
   - `GET /api/admin/auth/me`
   - `requireAdmin` 中间件
   - 种子脚本：创建初始 `owner`（密码仅 env / 交互，禁止写死进仓库）
3. **密码**：argon2 或 bcrypt
4. **OSS 封装**（ali-oss 或 AWS S3 兼容 SDK）
   - `putObject` `copyObject` `deleteObject` `getPublicUrl`
   - key 生成：`public/templates/...` `temp/generations/...` `temp/inputs/...`
5. **统一响应**：`{ data }` / `{ error: { code, message } }`
6. CORS：同站反代下默认同域；dev 如需可放行 web origin

### 完成定义

- [ ] 错误密码 401；正确密码 me 有用户  
- [ ] 集成测试或脚本：上传 1KB 到 `temp/` 成功（需真实 OSS 凭据的本地测可跳过 CI）  

### 验证

```bash
# 登录
curl -c cookies.txt -X POST http://localhost:8787/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'
curl -b cookies.txt http://localhost:8787/api/admin/auth/me
```

### 文档

- `.env.example` 补齐 `OSS_REGION` `OSS_BUCKET` `OSS_ACCESS_KEY_ID` `OSS_ACCESS_KEY_SECRET` `OSS_CDN_BASE`（可选）  
- 注明：OSS 控制台为 `temp/` 配置 **3 天或 7 天生命周期**（与产品文案一致用 7 天）  

---

## PR-04 — 同站 Admin 壳与登录页（M1 UI）

**目标：** `/admin/login` + 鉴权路由守卫 + 后台布局。  
**依赖：** PR-03（可先 mock me，但建议真接口）  
**分支：** `feat/stage-a-pr04-admin-shell`

### 任务

1. 路由：
   - `/admin/login`
   - `/admin` layout（侧栏：模板、任务、Providers、退出）
   - 未登录访问 `/admin/*` → 重定向 login
2. API client：`credentials: 'include'`
3. 样式：与现站视觉协调，后台可用更密布局（表格友好）
4. 前台 Navbar **不**默认露出 Admin 入口（或仅 dev 显示）；运营收藏书签 `/admin`

### 完成定义

- [ ] 登录后进仪表盘占位页  
- [ ] 刷新保持登录（Cookie）  
- - [ ] 登出后无法进 `/admin`  

### 验证

手动：错误密码提示；成功进壳；直接打开 `/admin/templates` 未登录被拦。

---

## PR-05 — 模板 CMS CRUD + 发布规则（M1）

**目标：** 后台可完整管理模板元数据与变量；发布强制封面。  
**依赖：** PR-04  
**分支：** `feat/stage-a-pr05-template-cms`

### 任务

1. **API**
   - `GET/POST /api/admin/templates`
   - `GET/PATCH/DELETE /api/admin/templates/:id`
   - `POST /api/admin/templates/:id/publish`
   - `POST /api/admin/templates/:id/archive`
   - publish：**若无 `cover_object_key` → 409** `COVER_REQUIRED`
   - list 支持 `status` `q` `category` 筛选
2. **UI**
   - 模板列表（状态徽章、筛选）
   - 创建/编辑表单：name summary description category tags scenarios
   - **变量编辑器**：增删改 key/label/type/options/required/default
   - prompt 骨架 textarea（提示 `{{key}}`）
   - 状态操作：存草稿 / 发布 / 下架
3. **校验**：publish 前前端也可预检封面，最终以后端为准
4. `locale` 默认 `zh`；`i18n` 先 `{}` 不暴露复杂 UI

### 完成定义

- [ ] 无封面点发布 → 409 与 UI 错误提示  
- [ ] 有封面（可先用 SQL/脚本写 fake key 测）→ published  
- [ ] draft 前台 API 不可见（见 PR-11；此处管理端可见）  

### 验证

API 单测或手工 curl 覆盖 publish 有/无封面两条路径。

---

## PR-06 — 封面上传与绑定（M1）

**目标：** 运营上传图片 → OSS permanent → 写 `cover_*` + `media_objects`。  
**依赖：** PR-05、PR-03 OSS  
**分支：** `feat/stage-a-pr06-cover-upload`

### 任务

1. `POST /api/admin/templates/:id/cover` multipart 或先 STS 直传再 `POST .../cover/confirm`
   - 推荐阶段 A：**服务端收流上传**（实现简单，文件 < 10MB）
2. 写入 `public/templates/{id}/cover.webp`（可先原格式，后续再转 webp）
3. 更新 `prompt_templates.cover_object_key/url`；`media_objects` permanent
4. UI：编辑页封面预览、替换、删除（删除后 status 若 published 应自动回 draft 或禁止删——**建议禁止删除已发布封面除非先下架**）

### 完成定义

- [ ] 上传后列表/编辑页显示真实图  
- [ ] 再 publish 成功  

### 验证

上传一张图 → DB 有 media 行 → OSS 控制台可见对象 → publish 200。

---

## PR-07 — BullMQ Worker 骨架（M2/M3 基础）

**目标：** 创建 job → 入队 → Worker 更新状态；可跑 `noop` 探针任务。  
**依赖：** PR-03  
**分支：** `feat/stage-a-pr07-queue`

### 任务

1. Redis 连接 + BullMQ Queue/Worker
2. `POST /api/admin/jobs` `{ type: "noop", input: {} }` → 202 + jobId
3. `GET /api/admin/jobs` `GET /api/admin/jobs/:id`
4. Worker：取 job → PG `running` → 模拟工作 → `succeeded` + output
5. 失败重试策略：可配置 attempts；写 `error_message`
6. 进程：`npm run dev -w worker`；文档说明 api 与 worker 都要起

### 完成定义

- [ ] 管理端或 curl 建 noop → 数秒内 succeeded  
- [ ] 故意 throw → failed 且可 `POST .../retry`  

### 验证

```bash
# terminal1: api  terminal2: worker
curl -b cookies.txt -X POST .../api/admin/jobs -d '{"type":"noop","input":{}}'
curl -b cookies.txt .../api/admin/jobs/{id}
```

---

## PR-08 — Providers + LLM 结构化任务（M2）

**目标：** 可配置 LLM Provider；`image_reverse` / `text_expand` 真正调模型产出 TemplateDraft。  
**依赖：** PR-07、PR-02 shared zod  
**分支：** `feat/stage-a-pr08-llm-structure`

### 任务

1. **Providers API/CRUD**（admin）
   - kind llm/image/both；protocol；base_url；api_key_env；default_model；defaults
2. **Adapter：`openai_chat`**
   - structurePrompt(from_image | from_text)
   - 强制 JSON；zod 校验 TemplateDraft；失败抛可重试错误
3. **Job handlers**
   - `text_expand`：input.text
   - `image_reverse`：input 含 image object_key/url；必要时先把图转 data URL 或公网/签名 URL 给多模态
4. 参考图上传：`temp/inputs/{jobId}/source` + media_objects temp
5. 系统 prompt：变量 3～8、key 英文、骨架含全部占位符（写入代码常量，可配置化后置）

### 完成定义

- [ ] 配置 Provider（env 密钥）后，文本扩写 job 返回合法 variables + promptTemplate  
- [ ] 坏 JSON 时 job failed，不写坏模板  

### 验证

用一段电商 prompt 扩写；检查 output 通过 shared zod。

---

## PR-09 — 管理端智能入库 UI（M2）

**目标：** 图/文入口 + 轮询 job + 草稿编辑器落库。  
**依赖：** PR-08、PR-05  
**分支：** `feat/stage-a-pr09-ingest-ui`

### 任务

1. 页面：`/admin/ingest` 或模板列表「从图片/从文本创建」
2. 提交流程：建 job → 轮询 2s → 成功展示草稿表单（复用 PR-05 编辑器）
3. 「保存为草稿模板」→ `POST /api/admin/templates` + source/source_meta
4. 任务中心 `/admin/jobs`：列表状态、错误、重试按钮
5. UX：running 骨架屏；失败展示 error_message

### 完成定义

- [ ] 不写代码手工走通：上传图 → 草稿 → 保存 draft  
- [ ] 文本路径同样可走通  

### 验证

手工 E2E 清单打勾；截图或简短录屏可选。

---

## PR-10 — 生图任务与封面闭环（M3）

**目标：** 异步生图；结果可选绑定为模板封面；发布闭环完成。  
**依赖：** PR-07、PR-06、PR-08（providers）  
**分支：** `feat/stage-a-pr10-image-gen`

### 任务

1. Adapter：`openai_images`（或兼容 baseUrl）
2. Job `image_generate`：input.prompt size n templateId?
3. 结果：
   - 默认上传 `temp/generations/{jobId}/n.ext`（试跑）
   - 「设为封面」→ copy/put 到 `public/templates/{id}/cover...` + 更新模板
4. UI：模板编辑页「根据当前骨架（default 变量）生成封面」→ 选图 → 设封面 → 发布
5. 并发限制：worker 生图 concurrency=1 或 2

### 完成定义

- [ ] 从草稿到有真实封面 published 全异步可追踪  
- [ ] 无封面仍 409  

### 验证

完整运营路径验收（设计 §3.10 / §8）。

---

## PR-11 — 前台接入公开 Templates API（M4）

**目标：** 发现页/库/详情读 Postgres published；去掉对静态数组的强依赖。  
**依赖：** PR-05（有数据）、建议 PR-10 后有真封面  
**分支：** `feat/stage-a-pr11-public-api`

### 任务

1. **公开 API**
   - `GET /api/templates` 仅 `status=published`；排序 hot/latest/favorites；搜索 q；分类/标签
   - `GET /api/templates/:id` 非 published → 404（或 admin 另议）
2. **Web**
   - `src/data/templates.ts` 改为 API fetch 层（`getTemplates` `getTemplateById`）
   - 列表页 loading / empty / error
   - 详情页变量表单逻辑保持 `promptBuilder` 不变
3. **Dev fallback（可选）**：`VITE_USE_STATIC_TEMPLATES=1` 仍读本地，默认关闭
4. 相似模板：同 category 服务端或客户端滤

### 完成定义

- [ ] 后台发布新模板 → 刷新 `/library` 可见  
- [ ] 未发布不可见  
- [ ] 收藏/草稿/最近仍可用（id 对齐）  

### 验证

手工 + 可选 Playwright 冒烟：首页加载、进详情、复制 prompt。

---

## PR-12 — 种子迁移、运维文档、硬化（M5）

**目标：** 现有 MVP 模板进库；新环境可按文档拉起。  
**依赖：** PR-11  
**分支：** `feat/stage-a-pr12-seed-docs`

### 任务

1. **Seed 脚本**：读取现有 `templates` 内容（可暂时从 git 历史或保留一份 `seeds/templates.json`）
   - 写入 PG published
   - 封面：picsum URL 可先当 `cover_url` 外链，或下载转存 OSS（优先转存以便统一）
2. **README** 更新：架构、dev 三进程、env、OSS 生命周期、admin 初始账号流程
3. **运维短文** `docs/ops.md`：备份 PG、轮换密钥、队列卡死排查
4. **基础可观测**：api/worker 结构化日志（jobId）；failed job 计数 log
5. 清理：确认无密钥进库；`.gitignore` 含 `.env`

### 完成定义

- [ ] 新 clone + compose + migrate + seed + 三 dev 进程 → 前台有模板、admin 可登录  
- [ ] 设计文档总验收 §8 全部可勾选  

### 验证

按 README「从零启动」走一遍（最好第二台机器或干净环境）。

---

## 跨 PR 工程约定

### 环境变量清单（汇总）

```bash
DATABASE_URL=postgresql://promptix:promptix@localhost:5432/promptix
REDIS_URL=redis://localhost:6379
PORT=8787
JWT_SECRET=
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_PASSWORD=
OSS_REGION=
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_ENDPOINT=           # 可选
OSS_CDN_BASE=           # 可选公开前缀
OSS_PUBLIC_BASE_URL=    # 拼接 URL 用
# Provider 示例
LLM_API_KEY=
IMAGE_API_KEY=
```

### 测试策略

| 层级 | 范围 |
|------|------|
| 单元 | prompt 校验、TemplateDraft zod、publish 规则纯函数 |
| 集成 | API + 测试用 PG（或 testcontainers）；队列可用 ioredis mock/真实 Redis |
| 手工 | 每 PR 完成定义清单 |
| E2E（可选 PR-11 后） | 发布 → 前台可见 |

### 安全检查清单（每个涉及密钥的 PR）

- [ ] 无密钥进 git  
- [ ] admin 路由全保护  
- [ ] 公开 API 不泄露 draft/job input 敏感字段  
- [ ] 上传类型/大小限制（如图片 mime + 10MB）  

---

## 工作量参考（单人）

| PR | 粗估 |
|----|------|
| 01–03 | 2–4 天 |
| 04–06 | 2–3 天 |
| 07–09 | 3–5 天 |
| 10 | 1–2 天 |
| 11–12 | 1–2 天 |
| **合计** | **约 9–16 人日** |

（含联调与 OSS/模型密钥环境问题缓冲。）

---

## 执行时检查点（给执行会话）

按 [executing-plans](https://github.com/) 习惯，建议每批 **2～3 个 PR** 停顿回顾：

| 批次 | PR | 回顾焦点 |
|------|-----|----------|
| Batch 1 | 01–03 | 仓库结构、迁移、登录、OSS |
| Batch 2 | 04–06 | 后台 CMS 与封面 |
| Batch 3 | 07–09 | 队列与智能入库 |
| Batch 4 | 10–12 | 生图、前台、文档 |

**不要在 `main` 上直接堆大提交**；每 PR 小步合并。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-16 | 初版：12 PR 对齐设计 M0–M5 |
