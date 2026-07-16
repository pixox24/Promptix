# Promptix 运营后台 · OSS · 生图接入 — 设计文档

**日期：** 2026-07-16  
**状态：** 已确认  
**范围：** 阶段 A（运营后台优先）+ 存储/队列/多语言预留  

---

## 1. 背景与目标

### 1.1 现状（MVP）

- 纯前端 SPA：React 19 + Vite + Tailwind + React Router
- 模板写死在 `src/data/templates.ts`，封面为 picsum 占位
- 用户收藏/最近/草稿仅 localStorage
- 「立即生成」为占位，无后端、无数据库、无鉴权

### 1.2 阶段 A 目标

1. **同站运营后台**（不单独 admin 应用、不子域名拆站）管理提示词模板
2. 三条入库路径：手动创建、**图 → 模块化提示词**、**文 → 模块化提示词**
3. 接入 **LLM / 生图 Provider**（baseUrl、协议类型、模型、密钥等）
4. 生成封面并上传 **阿里云 OSS**，前台展示真实内容
5. **发布必须有封面**；长任务走 **异步队列**
6. 业务数据 **PostgreSQL**；文件 **OSS**；为用户生图 7 天清理、发布永久化、中英文切换预留

### 1.3 明确不做（阶段 A）

- 独立 admin 工程
- C 端账号、付费、社区投稿/评论
- 用户侧「立即生成」真链路（阶段 B）
- 完整中英文 UI（仅 schema / 默认 locale 预留）
- 多 Worker 集群编排（单 Worker 即可）

---

## 2. 已确认约束

| 项 | 决定 |
|----|------|
| 优先级 | 方案 A：运营后台优先 |
| 站点 | 前台 + 后台 **同一站点**（如 `/admin/*`） |
| Admin 形态 | **不**单独 admin 应用 |
| 数据库 | **必须 PostgreSQL**（不用 SQLite 作主库） |
| 对象存储 | **已有阿里云 OSS** |
| 发布规则 | **封面必须**，否则拒绝发布 |
| 任务执行 | **异步队列**（推荐 Redis + BullMQ） |
| i18n | 后续中英文切换；表结构预留 `locale` / `i18n` |
| 用户生成图（B） | `temp/` **7 天**后删除；用户**主动发布** → 永久 OSS |
| 提示词/用户信息 | **DB 为主**；OSS 只存文件（可冷备份 JSON） |

---

## 3. 系统边界与信息架构

### 3.1 同站路由

| 区域 | 路径 | 说明 |
|------|------|------|
| 前台 | `/` `/library` `/template/:id` `/my` | 现有能力；数据改读 API |
| 后台 | `/admin/login` `/admin/*` | 需管理员登录 |
| API | `/api/*` | 浏览器只打同源 `/api` |

后台与前台共用一个 Vite/React 工程，通过路由与布局区分；API 独立进程。

### 3.2 逻辑架构

```text
┌────────────────────────────────────────────┐
│  同一站点 (Vite React)                      │
│  公开页  +  /admin（侧栏壳 + 鉴权路由）      │
└─────────────────┬──────────────────────────┘
                  │ /api/* （dev 代理 / 生产反代）
                  ▼
┌────────────────────────────────────────────┐
│  API (Hono 或 Express)                      │
│  鉴权 · 模板 CRUD · 建任务 · 读 job 状态    │
│  OSS 签名/上传 · Provider 配置              │
└───────┬───────────────────┬────────────────┘
        │                   │
        ▼                   ▼
  PostgreSQL            Redis + BullMQ Worker
  模板/任务/媒体/账号    反推 · 扩写 · 生图
        │                   │
        └─────────┬─────────┘
                  ▼
         阿里云 OSS + CDN
         public/  temp/  private/
```

### 3.3 仓库结构（建议 monorepo）

```text
Promptix/
  apps/web          # 现有前端 + /admin 路由
  apps/api          # HTTP API
  apps/worker       # 可与 api 同进程启动，逻辑分离
  packages/shared   # PromptTemplate 等共享类型与 zod schema
  docker-compose.yml  # postgres + redis
```

阶段 A 允许 `api` 与 `worker` 同仓库同部署单元，但 **队列消费与 HTTP 入口代码分离**。

### 3.4 阿里云 OSS 前缀

| 前缀 | 用途 | 生命周期 |
|------|------|----------|
| `public/templates/{templateId}/` | 模板封面、样例 | 永久 + CDN |
| `temp/generations/{jobId}/` | 试生成/未绑定图 | **7 天自动删除** |
| `temp/inputs/{jobId}/` | 反推参考图等 | 7 天 |
| `public/published/{userId}/` | 用户发布（阶段 B） | 永久 |
| `private/` | 头像、需签名资源（后期） | 永久 + 签名 URL |

**规范：**

- AccessKey 仅服务端 / RAM 子账号；前端直传用 **STS**
- 发布转永久：服务端 **CopyObject** 到新 key，而非改单对象生命周期
- 业务元数据在 PG；OSS 不作为提示词/用户主库

---

## 4. 数据模型（PostgreSQL）

### 4.1 实体关系

```text
admin_users
prompt_templates ──< template_assets
providers
generation_jobs ── 关联 media_objects / template 草稿
media_objects
（阶段 B）users · published_works · user_library
```

### 4.2 `admin_users`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| email | text unique | |
| password_hash | text | argon2/bcrypt |
| display_name | text | |
| role | text | `owner` / `editor` |
| created_at | timestamptz | |

与 C 端 `users` 分表，避免权限模型混淆。

### 4.3 `prompt_templates`

对齐并扩展现有 `PromptTemplate`：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text 或 uuid PK | 可兼容 `tpl-xxx` |
| name, summary, description | text | 默认语言文案（见 i18n） |
| category | text | portrait / ecommerce / … |
| tags, scenarios | text[] | |
| variables | jsonb | `PromptVariable[]` |
| prompt_template | text | `{{key}}` 骨架 |
| negative_prompt | text null | |
| cover_object_key | text null | 发布前必须非空 |
| cover_url | text null | CDN URL 缓存 |
| status | text | `draft` / `published` / `archived` |
| is_featured, is_hot | bool | |
| favorite_count, use_count | int | |
| source | text | `manual` / `image_reverse` / `text_expand` |
| source_meta | jsonb | 原图 key、原文等 |
| model_hints | jsonb null | |
| locale | text | 默认 `zh`（主语言标记） |
| i18n | jsonb null | 见 §4.7 |
| published_at | timestamptz null | |
| created_by | uuid null | → admin_users |
| created_at, updated_at | timestamptz | |

**发布校验（硬规则）：** `status → published` 时 `cover_object_key`（或等价封面 media）必须存在，否则 API 返回 **409**。

### 4.4 `template_assets`（可选多样例）

| 字段 | 类型 |
|------|------|
| id | uuid |
| template_id | FK |
| object_key, url | text |
| kind | `cover` / `sample` |
| sort_order | int |
| width, height, bytes | int null |

### 4.5 `providers`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| name | text | |
| kind | `image` / `llm` / `both` | |
| protocol | text | `openai_chat` / `openai_images` / `generic_http` … |
| base_url | text | |
| api_key_encrypted | text null | 可选；生产优先 env |
| api_key_env | text null | 如 `PROVIDER_X_KEY` |
| default_model | text | |
| defaults | jsonb | size、steps 等 |
| auth_style | text | `bearer` / `header` |
| is_default, enabled | bool | |
| created_at, updated_at | | |

### 4.6 `generation_jobs`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| type | text | `image_reverse` / `text_expand` / `image_generate` / `structure` |
| status | text | `pending` / `queued` / `running` / `succeeded` / `failed` / `cancelled` |
| actor_type | text | `admin` / `user` |
| actor_id | uuid null | |
| provider_id | uuid null | |
| queue_name | text null | BullMQ queue |
| bull_job_id | text null | 对账 |
| attempts | int | |
| input | jsonb | |
| output | jsonb | 模板草稿、图片列表、错误细节 |
| template_id | text null | 成功入库后关联 |
| error_message | text null | |
| created_at, started_at, finished_at | | |

### 4.7 `media_objects`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| object_key | text unique | |
| bucket | text | |
| url | text | |
| storage_class | `temp` / `permanent` | |
| prefix_kind | `template` / `generation` / `published` / `input` | |
| expires_at | timestamptz null | temp 建议 +7d |
| owner_type, owner_id | null 可 | |
| job_id | uuid null | |
| mime, bytes, width, height | | |
| created_at, deleted_at | | |

### 4.8 中英文预留（i18n）

```json
// prompt_templates.i18n
{
  "en": {
    "name": "...",
    "summary": "...",
    "description": "...",
    "variables": [{ "key": "subject", "label": "Subject", "placeholder": "..." }],
    "promptTemplate": "optional override if bilingual skeletons differ",
    "scenarios": ["..."],
    "tags": ["..."]
  }
}
```

- 顶层字段 = 默认语言（`locale`，阶段 A 固定 `zh`）
- 前台日后：`?lang=en` 或 Accept-Language / 用户偏好合并 `i18n.en`
- 变量 **key 跨语言稳定**；仅 label/placeholder/options 文案可翻译
- 阶段 A：后台可只写中文；API 响应带 `locale` + 空 `i18n` 即可

### 4.9 阶段 B 预留表（不强制建）

- `users`
- `published_works`（发布图 + prompt 快照 + visibility）
- 用户收藏/草稿迁库

### 4.10 索引

- `prompt_templates(status, category, created_at DESC)`
- `prompt_templates` GIN(`tags`)（若标签筛常用）
- `generation_jobs(status, created_at)`
- `media_objects(storage_class, expires_at)`
- `media_objects(object_key)` UNIQUE

### 4.11 与前端类型映射

| 现有 | 存储 |
|------|------|
| `PromptTemplate` | `prompt_templates` + assets |
| `PromptVariable[]` | `variables` jsonb |
| localStorage 库 | 阶段 A 保留；B 再迁 |

---

## 5. 智能入库与生图流程

### 5.1 总览

运营在 `/admin`：

1. 手动创建/编辑  
2. 上传图 → 异步反推 → 草稿编辑  
3. 粘贴文 → 异步扩写 → 草稿编辑  
4. 异步生图 → 绑定封面 → **校验封面后发布**  
5. 前台仅展示 `published`

### 5.2 手动创建

- 保存 `draft`（允许暂无封面）
- 发布时强制封面

### 5.3 图 → 模块化（异步）

```text
上传参考图（API 或 STS → temp/inputs/{jobId}）
  → INSERT generation_jobs (image_reverse, pending)
  → Enqueue BullMQ
  → Worker: LLM 视觉 + JSON schema 校验
  → job.output = TemplateDraft, status=succeeded
  → 运营编辑 → 存 prompt_templates draft
  → 可选 image_generate → 设封面
  → publish（必须封面）
```

### 5.4 文 → 模块化（异步）

同 5.3，`type=text_expand`，input 为文本；**共用 TemplateDraft schema 与草稿编辑器**。

### 5.5 TemplateDraft 契约（LLM 输出）

```json
{
  "name": "string",
  "summary": "string",
  "description": "string",
  "category": "portrait|ecommerce|poster|logo|illustration|edit",
  "tags": ["..."],
  "scenarios": ["..."],
  "variables": [
    {
      "key": "subject",
      "label": "主体",
      "type": "text|select|number|ratio",
      "required": true,
      "defaultValue": "...",
      "options": ["..."],
      "description": "..."
    }
  ],
  "promptTemplate": "A photo of {{subject}}, ...",
  "negativePrompt": "optional"
}
```

约束建议：变量 3～8 个；所有 `{{key}}` 出现在骨架中；select 给 3～6 options。

### 5.6 生图封面（异步）

```text
image_generate job
  → Image Adapter
  → 上传 OSS
       确认封面 → public/templates/{id}/cover.webp (permanent)
       试跑     → temp/generations/{jobId}/ (7 天)
  → media_objects
  → 更新模板 cover_* 
```

### 5.7 Provider Adapter

```ts
structurePrompt(input: {
  mode: 'from_image' | 'from_text'
  imageUrl?: string
  text?: string
  locale?: 'zh' | 'en'
}): Promise<TemplateDraft>

generateImage(input: {
  prompt: string
  negativePrompt?: string
  size?: string
  n?: number
  model?: string
}): Promise<{ images: { bytes?: Buffer; url?: string; width?: number; height?: number }[] }>
```

阶段 A 优先实现：

| protocol | 用途 |
|----------|------|
| `openai_chat` | 多模态反推 + 文本扩写（JSON mode） |
| `openai_images` | 生图（含 OpenAI 兼容网关） |

### 5.8 发布规则

| 动作 | 规则 |
|------|------|
| 存草稿 | 允许无封面 |
| 发布 | **必须**封面；名称、骨架、变量基本完整 |
| 下架 | `archived` 或回 `draft`；前台立即不可见 |

### 5.9 失败与重试

- LLM JSON 非法 → failed，可重试结构化  
- 生图/OSS 失败 → failed，不写半截封面  
- BullMQ 有限重试；管理端展示 error 与 attempts  

---

## 6. API 与安全

### 6.1 同站与反代

- 浏览器只请求同源 `/api/*`
- 开发：Vite `server.proxy`
- 生产：Nginx/Caddy 反代到 API
- 避免浏览器直连 API 跨域带 Cookie 的复杂度

### 6.2 鉴权

| 受众 | 机制 |
|------|------|
| 管理员 | 登录签发 **JWT**，**HttpOnly + Secure + SameSite** Cookie（或 Authorization，二选一作全局约定；推荐 Cookie 防 XSS 读 token） |
| 公开读 | `GET /api/templates*` 无登录 |
| 写/任务/Provider | 必须 admin |

中间件：`requireAdmin` 保护 `/api/admin/*`。

### 6.3 路由草案

**公开**

- `GET /api/health`
- `GET /api/templates?category&tag&sort&q&page`
- `GET /api/templates/:id`

**管理（需登录）**

- `POST /api/admin/auth/login` · `POST /api/admin/auth/logout` · `GET /api/admin/auth/me`
- `CRUD /api/admin/templates`
- `POST /api/admin/templates/:id/publish` — **无封面 409**
- `POST /api/admin/templates/:id/archive`
- `POST /api/admin/templates/:id/cover` — 上传或绑定 media
- `GET|POST /api/admin/providers` · `PATCH /api/admin/providers/:id`
- `POST /api/admin/jobs` — body: `{ type, input, providerId? }`
- `GET /api/admin/jobs` · `GET /api/admin/jobs/:id`
- `POST /api/admin/jobs/:id/retry`
- `POST /api/admin/uploads/sts` 或 `POST /api/admin/uploads` — 小文件可走服务端

**Job 创建响应：** `202 { jobId, status: "queued" }`  
**轮询：** `GET .../jobs/:id` → pending|queued|running|succeeded|failed + output  

### 6.4 异步队列

| 项 | 选择 |
|----|------|
| 组件 | **Redis + BullMQ** |
| 队列名 | 如 `promptix-jobs` |
| 载荷 | `{ jobId }`，详情以 PG 为准 |
| 并发 | 生图并发可配置（默认 1～2） |
| 重试 | 有限次数 + 退避；不可恢复不重试 |
| 超时 | 按 type 配置（反推/生图不同） |

流程：API 写 PG `queued` → enqueue → Worker 更新 `running` → 调 Adapter → OSS → `succeeded|failed`。

可选：日后 SSE/WebSocket 推送；阶段 A 轮询足够。

### 6.5 OSS 与密钥

- 生图/LLM/OSS 密钥 **仅服务端**
- Provider：`api_key_env` 优先于库内密文
- RAM 最小权限；STS 限前缀与过期时间
- 管理接口防暴力：登录限流

### 6.6 前台数据源

- 用公开 templates API 替换（或 dev fallback）`src/data/templates.ts`
- `/my` 阶段 A 仍可 localStorage

---

## 7. 里程碑

### M0 — 基建

- monorepo：web / api / worker / shared  
- Postgres migrations、Redis、OSS 生命周期 `temp/*` = 7 天  
- docker-compose、env 模板、`/api` 反代  

**验收：** health 通过，PG/Redis/OSS 连通。

### M1 — CMS

- `/admin/login`、模板 CRUD、封面上传  
- 发布强制封面（409）  

**验收：** 手动模板有封面可发布；无封面不可发布。

### M2 — 智能入库

- Provider 配置、图反推/文扩写异步 job、草稿编辑器  

**验收：** 两条路径产出 draft（发布仍须封面）。

### M3 — 生图封面

- image_generate 异步、绑定 permanent 封面、发布闭环  

**验收：** 草稿 → 生图 → 封面 → 发布成功。

### M4 — 前台接 API

- 列表/详情读 published；核心浏览路径无静态死数据  

**验收：** 后台新模板出现在 `/library`。

### M5 — 硬化

- job 列表/重试、日志、备份说明、种子迁移现有模板  

**验收：** 按文档可从零部署；内容不丢。

### 后续

| 里程碑 | 内容 |
|--------|------|
| M6 | 用户生图 → temp 7 天；发布 → permanent + 作品表 |
| M7 | 前台中英文切换 + 后台编辑 `i18n` |

---

## 8. 阶段 A 总验收标准

1. 同站 `/admin` 可登录并管理模板全生命周期  
2. 手动 / 图反推 / 文扩写可用，**任务异步可查、可重试**  
3. **无封面不能发布**；有封面则前台可见  
4. Provider 可配置协议、baseUrl、模型；密钥服务端管理  
5. 图在阿里云 OSS，业务在 Postgres；temp 7 天规则已配置  
6. i18n 字段预留，不阻塞后续中英切换  

---

## 9. 风险与开放点

| 风险 | 缓解 |
|------|------|
| LLM 输出不稳定 | 严格 zod 校验 + 重试 + 人工编辑 |
| 生图成本 | 默认低并发；试跑走 temp |
| Node/依赖版本 | 开发环境建议 Node ≥ 22.12 或 20.19+（Vite 8） |
| 队列堆积 | 管理端监控 failed；限流建任务 |

实现前可再定（不阻塞设计）：ORM（Drizzle vs Prisma）、JWT 放 Cookie 还是 Bearer 最终二选一、具体 LLM/生图厂商型号。

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-16 | 初版：脑暴确认后定稿（同站、Postgres、阿里云 OSS、强制封面、异步队列、i18n 预留） |
