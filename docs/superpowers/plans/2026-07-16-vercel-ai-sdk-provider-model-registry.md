# Promptix Vercel AI SDK Provider and Model Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 Provider、历史 Job 和 65535 异步生图的前提下，将 Promptix 改造成“一个 Provider 连接可管理多个 Model”的架构，并使用 Vercel AI SDK 统一文本、视觉、结构化输出和标准同步生图调用。

**Architecture:** 使用加法数据库迁移新增 `provider_models` 和 `generation_jobs.model_id`，保留旧 Provider 字段及 `generation_jobs.provider_id` 作为一个发布周期内的兼容层。Worker 通过数据库模型配置动态创建 AI SDK 模型实例；标准协议走 AI SDK，`custom_65535_async` 继续走显式提交/轮询适配器。API 和后台以 Model 为任务选择单位，同时保留旧 `providerId` Job 输入以便历史客户端短期兼容。

**Tech Stack:** Node.js 22+、TypeScript、Hono、Drizzle ORM、PostgreSQL、BullMQ、React/Vite、Zod 3、Vercel AI SDK 7、Node Test Runner。

---

## 0. 执行者契约（必须先读）

这份计划面向能够访问完整仓库、执行终端命令并运行测试的编码 Agent。不要把整份文档一次性转成代码；严格逐 Task 执行，每个 Task 通过验收并提交后才进入下一项。

### 0.1 不可擅自改变的决定

1. 使用 Node.js 22 和 `ai@7.0.29`；`.nvmrc` 固定为 `22`，根 `package.json` 固定为 Node `>=22.0.0`。不得在本任务中切换其他 Node 或 AI SDK 主版本。
2. 本次不使用 Vercel AI Gateway，不新增 `AI_GATEWAY_API_KEY`。所有模型继续直连已有 Provider。
3. 首版 `adapterType` 只允许：
   - `openai_compatible`
   - `openai`
   - `anthropic`
   - `google`
   - `deepseek`
   - `custom_65535_async`
4. 不从数据库动态加载 npm 包；Adapter 必须来自代码中的穷举 `switch`。
5. Provider 代表连接和认证；Model 代表厂商模型 ID、能力、默认用途和调用默认值。
6. `generation_jobs.model_id` 是新主选择字段；`provider_id` 保留并同步写入，用于历史任务和回滚兼容。
7. 不删除 `providers.kind/protocol/default_model/defaults/is_default`。这些旧列在本次完成后只作为兼容列存在。
8. 65535 异步生图不得改成 AI SDK `generateImage()`；必须保留提交、`job_id`、轮询和厂商元数据。
9. 密钥值不得写入数据库、日志、测试快照或浏览器；数据库只保存环境变量名。
10. 不引入 LangChain、LiteLLM、OpenRouter SDK、AI SDK UI 或聊天界面。

### 0.2 范围内能力

| 能力 | 首版实现 |
|---|---|
| 一个 Provider 添加多个模型 | 是 |
| 文本扩写和结构化 | AI SDK `generateText + Output.object` |
| 单模型视觉反推 | 支持 vision 的结构化模型直接完成 |
| 双模型视觉反推 | 非 vision 结构化模型 + 默认 vision 模型 |
| 标准同步生图 | AI SDK `generateImage` |
| 65535 异步生图 | 现有自定义轮询 Adapter |
| 模型默认用途 | 默认文本、默认视觉、默认生图三个独立标记 |
| 历史 Provider 数据迁移 | 每个旧 Provider 回填一个 Model |
| 历史 Job 执行 | `modelId` 缺失时按旧 `providerId` 找回填模型 |
| Provider 原生高级参数 | `providerOptions` JSON |

### 0.3 明确不在范围内

- 自动抓取厂商模型列表和价格。
- Token 账单、配额、熔断、跨 Provider 自动降级。
- Vercel AI Gateway、AWS Bedrock、Azure OpenAI、Vertex AI。
- Embedding、语音、视频、Agent tools。
- 删除旧数据库列的破坏性清理。
- 把整个 `AdminPage.tsx` 重写成新的设计系统。

### 0.4 强制停止条件

发生以下任意情况时，停止当前 Task，保留失败输出，不继续修改后续文件：

- 基线 `npm test` 或 `npm run build` 在任务开始前失败。
- 工作目录存在无法归属的未提交修改。
- `npm install` 解析出的主版本不是本计划固定版本。
- Drizzle 生成 SQL 包含 `DROP TABLE`、`DROP COLUMN` 或删除已有外键。
- 数据回填后存在旧 Provider 没有对应 Model。
- 单元测试为了通过而删除了断言、降低 Schema 约束或跳过测试。
- 真实 Provider 测试需要把密钥打印到终端或提交到仓库。
- 迁移生产库前没有可验证的 `pg_dump` 备份。

### 0.5 当前仓库已知状态

计划编写时主工作区存在用户自己的修改：

```text
M apps/web/package.json
M package-lock.json
```

内容是 macOS 原生 binding 调整。执行者不得覆盖、丢弃或混入本功能提交。开始实施前，必须由用户先单独提交这些修改，或者明确给出包含这些修改的基线 commit。之后从该 commit 创建隔离 worktree。

---

## 1. 目标数据模型和运行时数据流

### 1.1 `providers` 的新职责

新代码只使用以下 Provider 字段：

```ts
type ProviderConnection = {
  id: string;
  name: string;
  adapterType:
    | 'openai_compatible'
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'deepseek'
    | 'custom_65535_async';
  baseUrl: string;
  apiKeyEnv: string | null;
  authStyle: 'bearer' | 'header';
  enabled: boolean;
};
```

### 1.2 新增 `provider_models`

```ts
type ProviderModel = {
  id: string;
  providerId: string;
  name: string;
  modelId: string;
  capabilities: Array<'text' | 'vision' | 'image' | 'structured_output'>;
  defaults: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    providerOptions?: Record<string, Record<string, unknown>>;
    image?: {
      size?: `${number}x${number}`;
      aspectRatio?: `${number}:${number}`;
      n?: number;
      seed?: number;
    };
    async?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      maxQueueSeconds?: number;
      quality?: string;
      responseFormat?: string;
    };
  };
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};
```

约束：

- `(provider_id, model_id)` 唯一。
- 全库最多一个 `is_default_text=true`。
- 全库最多一个 `is_default_vision=true`。
- 全库最多一个 `is_default_image=true`。
- 默认文本模型必须同时有 `text` 和 `structured_output`。
- 默认视觉模型必须有 `vision`。
- 默认生图模型必须有 `image`。

### 1.3 Job 路由

```text
text_expand / structure
  -> 指定 modelId
  -> 未指定时使用 isDefaultText
  -> 要求 text + structured_output

image_reverse
  -> 指定或默认文本结构化模型
  -> 若该模型有 vision：单阶段直接结构化图片
  -> 若没有 vision：默认视觉模型描述图片，再由结构化模型输出 TemplateDraft

image_generate
  -> 指定 modelId
  -> 未指定时使用 isDefaultImage
  -> custom_65535_async：自定义轮询
  -> 其他 Adapter：AI SDK generateImage
```

### 1.4 API 合同

```text
GET    /api/admin/providers
POST   /api/admin/providers
PATCH  /api/admin/providers/:id
DELETE /api/admin/providers/:id

GET    /api/admin/models?providerId=&capability=
POST   /api/admin/models
PATCH  /api/admin/models/:id
DELETE /api/admin/models/:id

POST /api/admin/jobs
body: { type, input, modelId?, providerId?, templateId? }

POST /api/admin/jobs/image-reverse
multipart: file, modelId?；providerId? 仅为兼容输入
```

新 UI 只发送 `modelId`。API 在写 Job 时根据 Model 同步写入 `providerId`。

---

## 2. 文件地图

### 新建

| 文件 | 单一职责 |
|---|---|
| `apps/api/src/routes/models.ts` | Model CRUD、默认模型唯一性和引用保护 |
| `apps/worker/src/model-types.ts` | Worker 使用的 Provider/Model 运行时类型 |
| `apps/worker/src/model-factory.ts` | 数据库配置到 AI SDK Language/Image Model 的穷举工厂 |
| `apps/worker/src/model-defaults.ts` | 新旧 defaults 归一化 |
| `apps/worker/src/model-resolver.ts` | 按 modelId、旧 providerId 或默认用途解析模型 |
| `apps/worker/src/model-routing.ts` | Job 类型到默认角色和能力要求的纯函数 |
| `apps/worker/src/ai-adapters.ts` | AI SDK 文本、视觉、结构化和同步生图 |
| `apps/worker/src/async-image-adapter.ts` | 65535 异步提交与轮询 |
| `apps/worker/test/model-factory.test.mjs` | Adapter 工厂和密钥测试 |
| `apps/worker/test/model-routing.test.mjs` | Job 模型选择和 vision fallback 测试 |
| `apps/web/src/types/adminModels.ts` | 后台 Provider/Model API 类型 |
| `apps/web/src/pages/admin/ProviderModelsPage.tsx` | Provider 与 Model 管理 UI |

### 修改

| 文件 | 修改目的 |
|---|---|
| `.nvmrc` | 固定本地和 CI 的 Node 22 基线 |
| `package.json` | 将 Node engine 升级为 `>=22.0.0` |
| `package-lock.json` | 锁定 AI SDK 7 依赖 |
| `packages/shared/src/index.ts` | Adapter、能力和 Model 输入 Schema |
| `packages/shared/test/contracts.test.mjs` | Model 合同验证 |
| `apps/api/src/db/schema.ts` | 新表、新列、索引和关系 |
| `apps/api/src/routes/providers.ts` | Provider 只管理连接字段 |
| `apps/api/src/routes/jobs.ts` | 接受并验证 `modelId` |
| `apps/api/src/index.ts` | 挂载 Models 路由 |
| `apps/worker/package.json` | AI SDK 依赖 |
| `apps/worker/src/db.ts` | Worker 镜像 Schema |
| `apps/worker/src/adapters.ts` | 变成稳定 facade，转发 AI/异步实现 |
| `apps/worker/src/index.ts` | 基于模型能力编排 Job |
| `apps/worker/test/deepseek-provider.test.mjs` | 改为 AI SDK 结构化/视觉测试 |
| `apps/worker/test/image-provider.test.mjs` | 同步 AI SDK 与异步协议回归 |
| `apps/web/src/pages/AdminPage.tsx` | 使用新管理页和 Model 下拉框 |
| `.env.example` | 补充各原生 Provider key 示例 |
| `README.md` | 更新 Provider/Model 架构说明 |
| `docs/ops.md` | 迁移、密钥和排错说明 |

### 由 Drizzle 生成后审查

```text
apps/api/drizzle/0002_ai_sdk_model_registry.sql
apps/api/drizzle/meta/0002_snapshot.json
apps/api/drizzle/meta/_journal.json
```

---

## Task 1: 建立隔离工作区并确认基线

**Files:**
- Inspect: `apps/web/package.json`
- Inspect: `package-lock.json`
- No feature file changes

- [ ] **Step 1: 确认用户已处理当前未提交修改**

Run:

```bash
git status --short
```

Expected：输出为空。如果仍显示 `apps/web/package.json` 或 `package-lock.json`，停止并请用户先单独提交；不要 stash、reset 或 checkout 用户修改。

- [ ] **Step 2: 创建隔离 worktree**

Run from repository root:

```bash
git worktree add ../Promptix-ai-sdk -b codex/ai-sdk-model-registry
cd ../Promptix-ai-sdk
```

Expected：当前分支为 `codex/ai-sdk-model-registry`，`git status --short` 为空。

- [ ] **Step 3: 安装锁定依赖并运行基线**

Run:

```bash
npm ci
npm test
npm run build
npm run lint
```

Expected：四条命令退出码均为 `0`。记录测试数量和构建输出；后续最终结果必须不少于该测试数量。

- [ ] **Step 4: 记录基线 commit**

Run:

```bash
git rev-parse HEAD
git status --short
```

Expected：保存 commit hash 到执行记录，状态为空。本 Task 不创建 commit。

---

## Task 2: 升级 Node 22 并固定 AI SDK 7 依赖

**Files:**
- Create: `.nvmrc`
- Modify: `package.json`
- Modify: `apps/worker/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 固定 Node 22 基线**

创建 `.nvmrc`：

```text
22
```

将根 `package.json` engine 改为：

```json
"engines": {
  "node": ">=22.0.0"
}
```

- [ ] **Step 2: 切换并验证 Node 22**

Run:

```bash
nvm install 22
nvm use 22
node -e "const major=Number(process.versions.node.split('.')[0]); if(major!==22) process.exit(1); console.log(process.version)"
```

Expected：输出 `v22.x.x`。CI 和生产镜像也必须使用 Node 22，不能只修改 engine 文本。

- [ ] **Step 3: 安装精确版本**

Run:

```bash
npm install -w @promptix/worker --save-exact \
  ai@7.0.29 \
  @ai-sdk/openai-compatible@3.0.11 \
  @ai-sdk/openai@4.0.15 \
  @ai-sdk/anthropic@4.0.15 \
  @ai-sdk/google@4.0.17 \
  @ai-sdk/deepseek@3.0.11
```

Expected：命令成功；只修改 `apps/worker/package.json` 和根 `package-lock.json`。

- [ ] **Step 4: 验证安装版本和 Node 兼容性**

Run:

```bash
npm ls ai @ai-sdk/openai-compatible @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/deepseek
npm view ai@7.0.29 engines --json
```

Expected：版本与 Step 3 完全一致；`ai` engines 显示 `node >=22`；没有 `invalid` 或 `extraneous`。

- [ ] **Step 5: 验证 Node 文件一致**

Run:

```bash
node -e "const fs=require('node:fs'); const p=require('./package.json'); if(p.engines.node!=='>=22.0.0'||fs.readFileSync('.nvmrc','utf8').trim()!=='22') process.exit(1); console.log(p.engines.node)"
```

Expected：输出 `>=22.0.0`。

- [ ] **Step 6: 构建 Worker**

Run:

```bash
npm run build -w @promptix/worker
```

Expected：PASS。

- [ ] **Step 7: 提交 Node 和依赖升级**

```bash
git add .nvmrc package.json apps/worker/package.json package-lock.json
git commit -m "build: upgrade to Node 22 and AI SDK 7"
```

Expected：commit 只包含上述两个文件。

---

## Task 3: 添加共享 Adapter、能力和模型配置合同

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/test/contracts.test.mjs`

- [ ] **Step 1: 先写失败测试**

在 `packages/shared/test/contracts.test.mjs` 的 import 中加入：

```js
import {
  providerAdapterSchema,
  providerModelInputSchema,
} from '../dist/index.js';
```

在文件末尾加入：

```js
test('provider adapter list is closed and explicit', () => {
  assert.equal(providerAdapterSchema.safeParse('openai_compatible').success, true);
  assert.equal(providerAdapterSchema.safeParse('custom_65535_async').success, true);
  assert.equal(providerAdapterSchema.safeParse('runtime-npm-package').success, false);
});

test('default text model requires text and structured output', () => {
  const input = {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'DeepSeek V4 Pro',
    modelId: 'deepseek-v4-pro',
    capabilities: ['text'],
    defaults: {},
    enabled: true,
    isDefaultText: true,
    isDefaultVision: false,
    isDefaultImage: false,
  };
  assert.equal(providerModelInputSchema.safeParse(input).success, false);
  assert.equal(providerModelInputSchema.safeParse({
    ...input,
    capabilities: ['text', 'structured_output'],
  }).success, true);
});

test('vision and image defaults require matching capabilities', () => {
  const base = {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Model',
    modelId: 'model-id',
    capabilities: ['text', 'structured_output'],
    defaults: {},
    enabled: true,
    isDefaultText: false,
    isDefaultVision: true,
    isDefaultImage: false,
  };
  assert.equal(providerModelInputSchema.safeParse(base).success, false);
  assert.equal(providerModelInputSchema.safeParse({
    ...base,
    capabilities: ['text', 'structured_output', 'vision'],
  }).success, true);
  assert.equal(providerModelInputSchema.safeParse({
    ...base,
    isDefaultVision: false,
    isDefaultImage: true,
  }).success, false);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
npm run test -w @promptix/shared
```

Expected：FAIL，错误指出 `providerAdapterSchema` 或 `providerModelInputSchema` 未导出。

- [ ] **Step 3: 添加共享 Schema**

在 `packages/shared/src/index.ts` 的 Provider Schema 区域保留旧的 `providerKindSchema` 和 `providerProtocolSchema`，随后加入完整定义：

```ts
export const providerAdapterSchema = z.enum([
  'openai_compatible',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom_65535_async',
]);
export type ProviderAdapter = z.infer<typeof providerAdapterSchema>;

export const modelCapabilitySchema = z.enum([
  'text',
  'vision',
  'image',
  'structured_output',
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

const providerOptionsSchema = z.record(z.record(z.unknown()));

export const modelDefaultsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(131072).optional(),
  topP: z.number().min(0).max(1).optional(),
  providerOptions: providerOptionsSchema.optional(),
  image: z.object({
    size: z.string().regex(/^\d+x\d+$/).optional(),
    aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
    n: z.number().int().min(1).max(10).optional(),
    seed: z.number().int().nonnegative().optional(),
  }).optional(),
  async: z.object({
    pollIntervalMs: z.number().int().min(250).max(10000).optional(),
    timeoutMs: z.number().int().min(10000).max(3600000).optional(),
    maxQueueSeconds: z.number().int().min(1).max(3600).optional(),
    quality: z.string().min(1).optional(),
    responseFormat: z.string().min(1).optional(),
  }).optional(),
}).default({});
export type ModelDefaults = z.infer<typeof modelDefaultsSchema>;

export const providerModelInputSchema = z.object({
  providerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  modelId: z.string().trim().min(1).max(200),
  capabilities: z.array(modelCapabilitySchema).min(1),
  defaults: modelDefaultsSchema,
  enabled: z.boolean().default(true),
  isDefaultText: z.boolean().default(false),
  isDefaultVision: z.boolean().default(false),
  isDefaultImage: z.boolean().default(false),
}).superRefine((value, ctx) => {
  const capabilities = new Set(value.capabilities);
  if (value.isDefaultText &&
      (!capabilities.has('text') || !capabilities.has('structured_output'))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultText'],
      message: 'Default text model requires text and structured_output capabilities',
    });
  }
  if (value.isDefaultVision && !capabilities.has('vision')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultVision'],
      message: 'Default vision model requires vision capability',
    });
  }
  if (value.isDefaultImage && !capabilities.has('image')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultImage'],
      message: 'Default image model requires image capability',
    });
  }
});
export type ProviderModelInput = z.infer<typeof providerModelInputSchema>;
```

- [ ] **Step 4: 运行共享测试**

Run:

```bash
npm run test -w @promptix/shared
```

Expected：全部 PASS，新增 3 个测试。

- [ ] **Step 5: 提交合同**

```bash
git add packages/shared/src/index.ts packages/shared/test/contracts.test.mjs
git commit -m "feat: define provider model contracts"
```

---

## Task 4: 添加数据库 Schema 和加法迁移

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create after generation: `apps/api/drizzle/0002_ai_sdk_model_registry.sql`
- Create after generation: `apps/api/drizzle/meta/0002_snapshot.json`
- Modify after generation: `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: 修改 Drizzle Schema**

在 `apps/api/src/db/schema.ts` 顶部加入：

```ts
import { sql } from 'drizzle-orm';
```

给 `providers` 添加字段，旧字段全部保留：

```ts
adapterType: text('adapter_type').notNull().default('openai_compatible'),
```

在 `providers` 后新增：

```ts
export const providerModels = pgTable(
  'provider_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    modelId: text('model_id').notNull(),
    capabilities: text('capabilities')
      .array()
      .notNull()
      .default(sql`ARRAY['text']::text[]`),
    defaults: jsonb('defaults').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    isDefaultText: boolean('is_default_text').notNull().default(false),
    isDefaultVision: boolean('is_default_vision').notNull().default(false),
    isDefaultImage: boolean('is_default_image').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('provider_models_provider_model_uidx').on(t.providerId, t.modelId),
    index('provider_models_provider_enabled_idx').on(t.providerId, t.enabled),
    uniqueIndex('provider_models_default_text_uidx')
      .on(t.isDefaultText)
      .where(sql`${t.isDefaultText} = true`),
    uniqueIndex('provider_models_default_vision_uidx')
      .on(t.isDefaultVision)
      .where(sql`${t.isDefaultVision} = true`),
    uniqueIndex('provider_models_default_image_uidx')
      .on(t.isDefaultImage)
      .where(sql`${t.isDefaultImage} = true`),
  ],
);
```

给 `generationJobs` 添加：

```ts
modelId: uuid('model_id').references(() => providerModels.id),
```

- [ ] **Step 2: 生成迁移骨架**

Run:

```bash
npm run db:generate
```

Expected：生成编号 `0002` 的 SQL 和 snapshot；SQL 只包含新增列、表、索引和外键。

- [ ] **Step 3: 将迁移文件固定命名**

如果生成文件名不是 `0002_ai_sdk_model_registry.sql`，将该 `0002_*.sql` 重命名，并把 `apps/api/drizzle/meta/_journal.json` 最后一项 `tag` 改为 `0002_ai_sdk_model_registry`。不要改 snapshot 文件名。

- [ ] **Step 4: 在默认用途 partial index 创建前加入数据回填 SQL**

确保 `apps/api/drizzle/0002_ai_sdk_model_registry.sql` 的执行顺序是：新增 Provider 列、建 Model 表、创建 `(provider_id, model_id)` 唯一索引、加 Job 列、加外键、回填 Adapter、回填 Model、回填 Job、选默认模型、最后创建三个默认用途 partial unique index。`ON CONFLICT (provider_id, model_id)` 执行前必须已经存在对应唯一索引。回填段必须包含：

```sql
UPDATE "providers"
SET "adapter_type" = CASE "protocol"
  WHEN 'deepseek_chat' THEN 'deepseek'
  WHEN 'openai_images_async' THEN 'custom_65535_async'
  ELSE 'openai_compatible'
END;

INSERT INTO "provider_models" (
  "provider_id",
  "name",
  "model_id",
  "capabilities",
  "defaults",
  "enabled",
  "is_default_text",
  "is_default_vision",
  "is_default_image"
)
SELECT
  p."id",
  CASE WHEN p."default_model" = '' THEN p."name" ELSE p."default_model" END,
  CASE WHEN p."default_model" = '' THEN '__legacy_unconfigured__' ELSE p."default_model" END,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p."kind" IN ('llm', 'both') THEN 'text' END,
    CASE WHEN p."kind" IN ('llm', 'both') THEN 'structured_output' END,
    CASE WHEN COALESCE(p."defaults"->>'supportsVision', 'false') = 'true' THEN 'vision' END,
    CASE WHEN p."kind" IN ('image', 'both') THEN 'image' END
  ], NULL)::text[],
  p."defaults" - 'supportsVision',
  p."enabled",
  false,
  false,
  false
FROM "providers" p
ON CONFLICT ("provider_id", "model_id") DO NOTHING;

UPDATE "generation_jobs" gj
SET "model_id" = pm."id"
FROM "provider_models" pm
WHERE gj."model_id" IS NULL
  AND gj."provider_id" = pm."provider_id";

UPDATE "provider_models"
SET "is_default_text" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['text', 'structured_output']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);

UPDATE "provider_models"
SET "is_default_vision" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['vision']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);

UPDATE "provider_models"
SET "is_default_image" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['image']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);
```

若 Drizzle 在回填前生成了三个 partial unique index，把这些 index 语句移动到上述三个默认值 `UPDATE` 之后。

- [ ] **Step 5: 静态审查迁移**

Run:

```bash
rg -n "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM" apps/api/drizzle/0002_ai_sdk_model_registry.sql
rg -n "provider_models|adapter_type|model_id" apps/api/drizzle/0002_ai_sdk_model_registry.sql
```

Expected：第一条无输出；第二条能看到表、列、回填、外键和索引。

- [ ] **Step 6: 在空测试数据库执行迁移**

先创建独立数据库，不得使用开发库或生产库：

```bash
createdb promptix_ai_sdk_test
DATABASE_URL=postgresql://localhost:5432/promptix_ai_sdk_test npm run db:migrate
```

Expected：输出 `[migrate] done`。

- [ ] **Step 7: 验证迁移对象**

Run:

```bash
psql postgresql://localhost:5432/promptix_ai_sdk_test -c "\d provider_models"
psql postgresql://localhost:5432/promptix_ai_sdk_test -c "\d generation_jobs"
```

Expected：`provider_models` 包含全部字段和三个 partial unique index；`generation_jobs` 同时包含 `provider_id` 与 `model_id`。

- [ ] **Step 8: 构建 API 并提交**

```bash
npm run build -w @promptix/api
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat: add provider model registry schema"
```

Expected：API build PASS；commit 不包含其他文件。

---

## Task 5: 将 Provider API 收敛为连接配置

**Files:**
- Modify: `apps/api/src/routes/providers.ts`

- [ ] **Step 1: 用新合同替换 Provider 输入 Schema**

将 `apps/api/src/routes/providers.ts` 的 import 和 `providerInput` 改为：

```ts
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { providerAdapterSchema } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';

const providerInput = z.object({
  name: z.string().trim().min(1).max(120),
  adapterType: providerAdapterSchema,
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional().nullable(),
  authStyle: z.enum(['bearer', 'header']).default('bearer'),
  enabled: z.boolean().default(true),
});

function legacyProtocol(adapterType: z.infer<typeof providerAdapterSchema>) {
  switch (adapterType) {
    case 'deepseek': return 'deepseek_chat';
    case 'custom_65535_async': return 'openai_images_async';
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'openai_compatible':
      return 'openai_chat';
  }
}
```

- [ ] **Step 2: 保留安全输出并增加回滚兼容写入**

Provider 路由主体应为：

```ts
function safeProvider(p: typeof providers.$inferSelect) {
  const { apiKeyEncrypted: _secret, ...safe } = p;
  return {
    ...safe,
    apiKeyConfigured: Boolean(p.apiKeyEnv && process.env[p.apiKeyEnv]),
  };
}

export const providerRoutes = new Hono<AdminVars>();
providerRoutes.use('*', requireAdmin);

providerRoutes.get('/', async (c) => {
  const rows = await getDb().select().from(providers).orderBy(desc(providers.updatedAt));
  return ok(c, rows.map(safeProvider));
});

providerRoutes.post('/', async (c) => {
  const parsed = providerInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const [row] = await getDb().insert(providers).values({
    ...parsed.data,
    kind: 'llm',
    protocol: legacyProtocol(parsed.data.adapterType),
    defaultModel: '',
    defaults: {},
    isDefault: false,
  }).returning();
  return ok(c, safeProvider(row), 201);
});

providerRoutes.patch('/:id', async (c) => {
  const parsed = providerInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const values = {
    ...parsed.data,
    ...(parsed.data.adapterType
      ? { protocol: legacyProtocol(parsed.data.adapterType) }
      : {}),
    updatedAt: new Date(),
  };
  const [row] = await getDb().update(providers)
    .set(values)
    .where(eq(providers.id, c.req.param('id')))
    .returning();
  return row ? ok(c, safeProvider(row)) : fail(c, 'NOT_FOUND', 'Provider not found', 404);
});

providerRoutes.delete('/:id', async (c) => {
  try {
    const [row] = await getDb().delete(providers)
      .where(eq(providers.id, c.req.param('id')))
      .returning();
    return row ? ok(c, { ok: true }) : fail(c, 'NOT_FOUND', 'Provider not found', 404);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return fail(c, 'PROVIDER_IN_USE', 'Provider is referenced by generation jobs', 409);
    }
    throw error;
  }
});
```

- [ ] **Step 3: 构建 API**

Run:

```bash
npm run build -w @promptix/api
```

Expected：PASS；没有未使用 import。

- [ ] **Step 4: 提交 Provider API**

```bash
git add apps/api/src/routes/providers.ts
git commit -m "refactor: make providers connection-only"
```

---

## Task 6: 增加 Model CRUD API 和默认值不变量

**Files:**
- Create: `apps/api/src/routes/models.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: 创建 Model 路由文件**

创建 `apps/api/src/routes/models.ts`，内容如下：

```ts
import { Hono } from 'hono';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  modelCapabilitySchema,
  modelDefaultsSchema,
  providerModelInputSchema,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { generationJobs, providerModels, providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';

const modelPatchSchema = z.object({
  providerId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  capabilities: z.array(modelCapabilitySchema).min(1).optional(),
  defaults: modelDefaultsSchema.optional(),
  enabled: z.boolean().optional(),
  isDefaultText: z.boolean().optional(),
  isDefaultVision: z.boolean().optional(),
  isDefaultImage: z.boolean().optional(),
});

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

async function clearReplacedDefaults(
  tx: Tx,
  value: { isDefaultText?: boolean; isDefaultVision?: boolean; isDefaultImage?: boolean },
) {
  if (value.isDefaultText) {
    await tx.update(providerModels).set({ isDefaultText: false })
      .where(eq(providerModels.isDefaultText, true));
  }
  if (value.isDefaultVision) {
    await tx.update(providerModels).set({ isDefaultVision: false })
      .where(eq(providerModels.isDefaultVision, true));
  }
  if (value.isDefaultImage) {
    await tx.update(providerModels).set({ isDefaultImage: false })
      .where(eq(providerModels.isDefaultImage, true));
  }
}

async function providerExists(providerId: string) {
  const [provider] = await getDb().select({ id: providers.id })
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);
  return Boolean(provider);
}

export const modelRoutes = new Hono<AdminVars>();
modelRoutes.use('*', requireAdmin);

modelRoutes.get('/', async (c) => {
  const providerId = c.req.query('providerId');
  const capability = c.req.query('capability');
  if (capability && !modelCapabilitySchema.safeParse(capability).success) {
    return fail(c, 'VALIDATION_ERROR', 'Invalid model capability', 400);
  }
  const filters = [
    ...(providerId ? [eq(providerModels.providerId, providerId)] : []),
    ...(capability
      ? [sql`${providerModels.capabilities} @> ARRAY[${capability}]::text[]`]
      : []),
  ];
  const rows = await getDb().select({
    model: providerModels,
    providerName: providers.name,
    providerEnabled: providers.enabled,
    adapterType: providers.adapterType,
    apiKeyEnv: providers.apiKeyEnv,
  }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(providerModels.updatedAt));
  return ok(c, rows.map((row) => ({
    ...row.model,
    providerName: row.providerName,
    providerEnabled: row.providerEnabled,
    adapterType: row.adapterType,
    apiKeyConfigured: Boolean(row.apiKeyEnv && process.env[row.apiKeyEnv]),
  })));
});

modelRoutes.post('/', async (c) => {
  const parsed = providerModelInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  if (!(await providerExists(parsed.data.providerId))) {
    return fail(c, 'PROVIDER_NOT_FOUND', 'Provider not found', 404);
  }
  try {
    const row = await getDb().transaction(async (tx) => {
      await clearReplacedDefaults(tx, parsed.data);
      const [created] = await tx.insert(providerModels).values(parsed.data).returning();
      return created;
    });
    return ok(c, row, 201);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(c, 'MODEL_ALREADY_EXISTS', 'This provider already contains the model ID', 409);
    }
    throw error;
  }
});

modelRoutes.patch('/:id', async (c) => {
  const patch = modelPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!patch.success) {
    return fail(c, 'VALIDATION_ERROR', patch.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  const [existing] = await getDb().select().from(providerModels)
    .where(eq(providerModels.id, c.req.param('id')))
    .limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Model not found', 404);

  const merged = providerModelInputSchema.safeParse({ ...existing, ...patch.data });
  if (!merged.success) {
    return fail(c, 'VALIDATION_ERROR', merged.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  if (!merged.data.enabled &&
      (merged.data.isDefaultText || merged.data.isDefaultVision || merged.data.isDefaultImage)) {
    return fail(c, 'DEFAULT_MODEL_DISABLE_FORBIDDEN', 'Reassign default roles before disabling this model', 409);
  }
  if (!(await providerExists(merged.data.providerId))) {
    return fail(c, 'PROVIDER_NOT_FOUND', 'Provider not found', 404);
  }

  try {
    const row = await getDb().transaction(async (tx) => {
      await clearReplacedDefaults(tx, merged.data);
      const [updated] = await tx.update(providerModels).set({
        ...merged.data,
        updatedAt: new Date(),
      }).where(eq(providerModels.id, existing.id)).returning();
      return updated;
    });
    return ok(c, row);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(c, 'MODEL_ALREADY_EXISTS', 'This provider already contains the model ID', 409);
    }
    throw error;
  }
});

modelRoutes.delete('/:id', async (c) => {
  const [existing] = await getDb().select().from(providerModels)
    .where(eq(providerModels.id, c.req.param('id')))
    .limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Model not found', 404);
  if (existing.isDefaultText || existing.isDefaultVision || existing.isDefaultImage) {
    return fail(c, 'DEFAULT_MODEL_DELETE_FORBIDDEN', 'Reassign default roles before deleting this model', 409);
  }
  const [{ value }] = await getDb().select({ value: count() }).from(generationJobs)
    .where(eq(generationJobs.modelId, existing.id));
  if (value > 0) {
    return fail(c, 'MODEL_IN_USE', 'Model is referenced by generation jobs; disable it instead', 409);
  }
  await getDb().delete(providerModels).where(eq(providerModels.id, existing.id));
  return ok(c, { ok: true });
});
```

如果 TypeScript 对 `Tx` 推断失败，不得改成 `any`。改为从 Drizzle 的 postgres-js 类型导出中引用实际 transaction 类型，或者把 `clearReplacedDefaults` 的三段更新直接内联到两个 transaction 回调中。

- [ ] **Step 2: 挂载路由**

在 `apps/api/src/index.ts` 加入：

```ts
import { modelRoutes } from './routes/models.js';
```

在 Provider 路由之后加入：

```ts
app.route('/api/admin/models', modelRoutes);
```

- [ ] **Step 3: 构建 API**

Run:

```bash
npm run build -w @promptix/api
```

Expected：PASS。若 transaction 类型失败，只允许采用 Step 1 指定的两种修正方式。

- [ ] **Step 4: 用测试数据库做 API 数据层烟测**

在测试库中插入一个 Provider，然后通过 SQL 验证相同 `(provider_id, model_id)` 不能重复，并验证同一时间不能有两个 `is_default_text=true`：

```bash
psql postgresql://localhost:5432/promptix_ai_sdk_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO providers (name, kind, protocol, base_url, default_model, adapter_type)
VALUES ('Test', 'llm', 'openai_chat', 'https://example.invalid/v1', '', 'openai_compatible');

INSERT INTO provider_models (provider_id, name, model_id, capabilities, is_default_text)
SELECT id, 'Model A', 'model-a', ARRAY['text','structured_output']::text[], true
FROM providers WHERE name = 'Test';

SELECT count(*) AS expected_one
FROM provider_models WHERE is_default_text = true;
SQL
```

Expected：`expected_one` 为 `1`。

- [ ] **Step 5: 提交 Model API**

```bash
git add apps/api/src/routes/models.ts apps/api/src/index.ts
git commit -m "feat: add provider model administration API"
```

---

## Task 7: 添加 Worker 镜像 Schema、运行时类型和 defaults 归一化

**Files:**
- Modify: `apps/worker/src/db.ts`
- Create: `apps/worker/src/model-types.ts`
- Create: `apps/worker/src/model-defaults.ts`
- Create: `apps/worker/test/model-factory.test.mjs`

- [ ] **Step 1: 先写 defaults 失败测试**

创建 `apps/worker/test/model-factory.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelDefaults, readProviderKey } from '../dist/model-defaults.js';

test('normalizes legacy DeepSeek defaults without leaking capability metadata', () => {
  const result = normalizeModelDefaults('deepseek', {
    supportsVision: false,
    temperature: 0.4,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
  });
  assert.equal(result.language.temperature, 0.4);
  assert.equal(result.language.maxOutputTokens, 4096);
  assert.deepEqual(result.language.providerOptions, {
    deepseek: { thinking: { type: 'disabled' } },
  });
  assert.equal('supportsVision' in result.language, false);
});

test('normalizes legacy async image defaults', () => {
  const result = normalizeModelDefaults('custom_65535_async', {
    size: '2048x2048',
    quality: 'high',
    response_format: 'url',
    asyncPollIntervalMs: 2000,
    asyncTimeoutMs: 900000,
    maxQueueSeconds: 120,
  });
  assert.deepEqual(result.image, { size: '2048x2048' });
  assert.deepEqual(result.async, {
    pollIntervalMs: 2000,
    timeoutMs: 900000,
    maxQueueSeconds: 120,
    quality: 'high',
    responseFormat: 'url',
  });
});

test('provider key lookup never returns an unset secret', () => {
  delete process.env.MISSING_PROVIDER_KEY;
  assert.throws(
    () => readProviderKey({ apiKeyEnv: 'MISSING_PROVIDER_KEY' }),
    /MISSING_PROVIDER_KEY is not set/,
  );
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：FAIL，`dist/model-defaults.js` 不存在。

- [ ] **Step 3: 更新 Worker 数据库镜像**

在 `apps/worker/src/db.ts` 给 `providers` 增加：

```ts
adapterType: text('adapter_type').notNull(),
```

在 `providers` 后增加：

```ts
export const providerModels = pgTable('provider_models', {
  id: uuid('id').primaryKey(),
  providerId: uuid('provider_id').notNull(),
  name: text('name').notNull(),
  modelId: text('model_id').notNull(),
  capabilities: text('capabilities').array().notNull(),
  defaults: jsonb('defaults').notNull(),
  enabled: boolean('enabled').notNull(),
  isDefaultText: boolean('is_default_text').notNull(),
  isDefaultVision: boolean('is_default_vision').notNull(),
  isDefaultImage: boolean('is_default_image').notNull(),
});
```

给 `generationJobs` 增加：

```ts
modelId: uuid('model_id'),
```

- [ ] **Step 4: 创建运行时类型**

创建 `apps/worker/src/model-types.ts`：

```ts
import type { ModelCapability, ProviderAdapter } from '@promptix/shared';

export type ProviderConnection = {
  id: string;
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv: string | null;
  authStyle: string;
  enabled: boolean;
  protocol: string;
  kind: string;
  defaultModel: string;
  defaults: unknown;
  isDefault: boolean;
};

export type ModelRecord = {
  id: string;
  providerId: string;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaults: unknown;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

export type ResolvedModel = {
  provider: ProviderConnection;
  model: ModelRecord;
};

export function hasCapability(model: ModelRecord, capability: ModelCapability) {
  return model.capabilities.includes(capability);
}
```

- [ ] **Step 5: 创建 defaults 归一化**

创建 `apps/worker/src/model-defaults.ts`：

```ts
import type { ProviderOptions } from 'ai';
import type { ProviderAdapter } from '@promptix/shared';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readProviderKey(provider: { apiKeyEnv: string | null }) {
  if (!provider.apiKeyEnv) return undefined;
  const value = process.env[provider.apiKeyEnv];
  if (!value) throw new Error(`Provider key environment variable ${provider.apiKeyEnv} is not set`);
  return value;
}

export function normalizeModelDefaults(adapterType: ProviderAdapter, value: unknown) {
  const raw = record(value);
  const language: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    providerOptions?: ProviderOptions;
  } = {};
  const temperature = finiteNumber(raw.temperature);
  const maxOutputTokens = finiteNumber(raw.maxOutputTokens ?? raw.max_tokens);
  const topP = finiteNumber(raw.topP ?? raw.top_p);
  if (temperature !== undefined) language.temperature = temperature;
  if (maxOutputTokens !== undefined) language.maxOutputTokens = maxOutputTokens;
  if (topP !== undefined) language.topP = topP;

  const configuredOptions = record(raw.providerOptions);
  const providerOptions: JsonRecord = { ...configuredOptions };
  if (adapterType === 'deepseek' && raw.thinking !== undefined) {
    providerOptions.deepseek = {
      ...record(providerOptions.deepseek),
      thinking: raw.thinking,
    };
  }
  if (Object.keys(providerOptions).length) {
    language.providerOptions = providerOptions as ProviderOptions;
  }

  const imageRaw = record(raw.image);
  const size = typeof imageRaw.size === 'string'
    ? imageRaw.size
    : typeof raw.size === 'string' ? raw.size : undefined;
  const aspectRatio = typeof imageRaw.aspectRatio === 'string'
    ? imageRaw.aspectRatio
    : undefined;
  const n = finiteNumber(imageRaw.n ?? raw.n);
  const seed = finiteNumber(imageRaw.seed ?? raw.seed);
  const image = {
    ...(size ? { size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(n !== undefined ? { n } : {}),
    ...(seed !== undefined ? { seed } : {}),
  };

  const asyncRaw = record(raw.async);
  const pollIntervalMs = finiteNumber(asyncRaw.pollIntervalMs ?? raw.asyncPollIntervalMs);
  const timeoutMs = finiteNumber(asyncRaw.timeoutMs ?? raw.asyncTimeoutMs);
  const maxQueueSeconds = finiteNumber(asyncRaw.maxQueueSeconds ?? raw.maxQueueSeconds);
  const quality = typeof asyncRaw.quality === 'string'
    ? asyncRaw.quality
    : typeof raw.quality === 'string' ? raw.quality : undefined;
  const responseFormat = typeof asyncRaw.responseFormat === 'string'
    ? asyncRaw.responseFormat
    : typeof raw.response_format === 'string' ? raw.response_format : undefined;
  const async = {
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxQueueSeconds !== undefined ? { maxQueueSeconds } : {}),
    ...(quality ? { quality } : {}),
    ...(responseFormat ? { responseFormat } : {}),
  };

  return { language, image, async };
}
```

- [ ] **Step 6: 运行 Worker 测试**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：全部 PASS，新增 3 个测试。

- [ ] **Step 7: 提交 Worker 基础类型**

```bash
git add apps/worker/src/db.ts apps/worker/src/model-types.ts apps/worker/src/model-defaults.ts apps/worker/test/model-factory.test.mjs
git commit -m "feat: add worker model runtime contracts"
```

---

## Task 8: 实现穷举 AI SDK Model Factory

**Files:**
- Create: `apps/worker/src/model-factory.ts`
- Modify: `apps/worker/test/model-factory.test.mjs`

- [ ] **Step 1: 追加失败测试**

在 `apps/worker/test/model-factory.test.mjs` import 中加入：

```js
import { createImageModel, createLanguageModel } from '../dist/model-factory.js';
```

追加：

```js
const baseProvider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Example',
  adapterType: 'openai_compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKeyEnv: 'TEST_MODEL_FACTORY_KEY',
  authStyle: 'bearer',
  enabled: true,
  protocol: 'openai_chat',
  kind: 'llm',
  defaultModel: 'example-model',
  defaults: {},
  isDefault: false,
};

const baseModel = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: baseProvider.id,
  name: 'Example model',
  modelId: 'example-model',
  capabilities: ['text', 'structured_output'],
  defaults: {},
  enabled: true,
  isDefaultText: true,
  isDefaultVision: false,
  isDefaultImage: false,
};

test('creates a dynamic OpenAI-compatible language model', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  const model = createLanguageModel({ provider: baseProvider, model: baseModel });
  assert.equal(model.modelId, 'example-model');
});

test('rejects language use for the custom async image adapter', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  assert.throws(
    () => createLanguageModel({
      provider: { ...baseProvider, adapterType: 'custom_65535_async' },
      model: baseModel,
    }),
    /does not provide language models/,
  );
});

test('rejects image use for Anthropic', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  assert.throws(
    () => createImageModel({
      provider: { ...baseProvider, adapterType: 'anthropic' },
      model: { ...baseModel, capabilities: ['image'] },
    }),
    /does not provide image models/,
  );
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：FAIL，`dist/model-factory.js` 不存在。

- [ ] **Step 3: 创建 Model Factory**

创建 `apps/worker/src/model-factory.ts`：

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ImageModel, LanguageModel } from 'ai';
import { readProviderKey } from './model-defaults.js';
import type { ResolvedModel } from './model-types.js';

function openAICompatibleProvider(config: ResolvedModel) {
  const apiKey = readProviderKey(config.provider);
  const auth = config.provider.authStyle === 'header'
    ? { headers: apiKey ? { 'X-API-Key': apiKey } : {} }
    : { apiKey };
  return createOpenAICompatible({
    name: 'promptix',
    baseURL: config.provider.baseUrl.replace(/\/$/, ''),
    ...auth,
  });
}

export function createLanguageModel(config: ResolvedModel): LanguageModel {
  const apiKey = readProviderKey(config.provider);
  switch (config.provider.adapterType) {
    case 'openai_compatible':
      return openAICompatibleProvider(config).chatModel(config.model.modelId);
    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'google':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'deepseek':
      return createDeepSeek({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'custom_65535_async':
      throw new Error('custom_65535_async does not provide language models');
  }
}

export function createImageModel(config: ResolvedModel): ImageModel {
  const apiKey = readProviderKey(config.provider);
  switch (config.provider.adapterType) {
    case 'openai_compatible':
      return openAICompatibleProvider(config).imageModel(config.model.modelId);
    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      }).image(config.model.modelId);
    case 'google':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      }).image(config.model.modelId);
    case 'anthropic':
      throw new Error('anthropic does not provide image models');
    case 'deepseek':
      throw new Error('deepseek does not provide image models');
    case 'custom_65535_async':
      throw new Error('custom_65535_async is handled by the asynchronous adapter');
  }
}
```

`switch` 不允许增加 `default` 分支。这样新增 Adapter 时 TypeScript 会迫使执行者显式决定其语言和图片行为。

- [ ] **Step 4: 构建并测试**

Run:

```bash
npm run build -w @promptix/worker
npm run test -w @promptix/worker
```

Expected：全部 PASS。若某个原生 Provider 的 factory 方法名称与锁定版本类型不符，只能依据该锁定版本 `.d.ts` 修正对应 case，不得把原生 Provider 偷换成 OpenAI-compatible。

- [ ] **Step 5: 提交 Factory**

```bash
git add apps/worker/src/model-factory.ts apps/worker/test/model-factory.test.mjs
git commit -m "feat: create AI SDK model factory"
```

---

## Task 9: 用 AI SDK 实现结构化文本、视觉和同步生图

**Files:**
- Create: `apps/worker/src/ai-adapters.ts`
- Modify: `apps/worker/test/deepseek-provider.test.mjs`
- Modify: `apps/worker/test/image-provider.test.mjs`

- [ ] **Step 1: 将 DeepSeek 测试改成 ResolvedModel 合同**

将 `apps/worker/test/deepseek-provider.test.mjs` 替换为：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeImage, structurePrompt } from '../dist/ai-adapters.js';

const draft = {
  name: '优化模板',
  summary: '优化后的提示词',
  description: '结构化描述',
  category: 'illustration',
  tags: ['插画'],
  scenarios: ['创作'],
  variables: [{ key: 'subject', label: '主体', type: 'text' }],
  promptTemplate: '为 {{subject}} 创作一张精致插画',
};

const provider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'DeepSeek',
  adapterType: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'TEST_DEEPSEEK_API_KEY',
  authStyle: 'bearer',
  enabled: true,
  protocol: 'deepseek_chat',
  kind: 'llm',
  defaultModel: 'deepseek-v4-pro',
  defaults: {},
  isDefault: true,
};

const model = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: provider.id,
  name: 'DeepSeek V4 Pro',
  modelId: 'deepseek-v4-pro',
  capabilities: ['text', 'structured_output'],
  defaults: {
    maxOutputTokens: 4096,
    providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
  },
  enabled: true,
  isDefaultText: true,
  isDefaultVision: false,
  isDefaultImage: false,
};

test('AI SDK produces and normalizes a TemplateDraft', async () => {
  process.env.TEST_DEEPSEEK_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.equal(body.stream, false);
    assert.equal(body.thinking.type, 'disabled');
    return new Response(JSON.stringify({
      id: 'chat-test',
      object: 'chat.completion',
      created: 1,
      model: 'deepseek-v4-pro',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(draft) },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await structurePrompt({ provider, model }, { text: '优化猫咪插画' });
    assert.equal(result.name, '优化模板');
    assert.equal(result.variables[0].id, 'var-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('vision model sends an AI SDK image content part', async () => {
  process.env.TEST_DEEPSEEK_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const content = body.messages[1].content;
    assert.equal(Array.isArray(content), true);
    assert.equal(content.some((part) => part.type === 'image_url'), true);
    return new Response(JSON.stringify({
      id: 'chat-vision',
      object: 'chat.completion',
      created: 1,
      model: 'vision-model',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: '蓝色背景中的白猫，柔和侧光。' },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await describeImage({
      provider: { ...provider, adapterType: 'openai_compatible' },
      model: { ...model, modelId: 'vision-model', capabilities: ['text', 'vision'] },
    }, 'data:image/png;base64,AA==');
    assert.match(result, /白猫/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: 将同步生图测试改成 AI SDK 输出合同**

保留 `apps/worker/test/image-provider.test.mjs` 的异步测试，先把同步测试的调用对象改成 `ResolvedModel`，Provider 使用 `openai_compatible`，Model capabilities 使用 `['image']`。模拟响应改为：

```js
return new Response(JSON.stringify({
  created: 1,
  data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
```

同步测试最终断言：

```js
assert.equal(result.images.length, 1);
assert.equal(result.images[0].b64_json, Buffer.from('png-bytes').toString('base64'));
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：FAIL，`dist/ai-adapters.js` 不存在。

- [ ] **Step 4: 创建 AI Adapter**

创建 `apps/worker/src/ai-adapters.ts`：

```ts
import {
  promptVariableSchema,
  templateDraftSchema,
  type TemplateDraft,
} from '@promptix/shared';
import { generateImage as aiGenerateImage, generateText, Output } from 'ai';
import { z } from 'zod';
import { createImageModel, createLanguageModel } from './model-factory.js';
import { normalizeModelDefaults } from './model-defaults.js';
import { hasCapability, type ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

const SYSTEM = `你是 Promptix 模板结构化引擎。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate；category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅 text/select/number/ratio/image；promptTemplate 必须包含全部变量的 {{key}} 占位符。`;

const generatedVariableSchema = promptVariableSchema.extend({
  id: promptVariableSchema.shape.id.optional(),
});

const generatedDraftSchema = templateDraftSchema.extend({
  variables: generatedVariableSchema.array().min(1).max(12),
});

async function inlineImage(imageUrl: string) {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Unable to read source image (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Source image exceeds 10MB');
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function normalizeDraft(output: z.infer<typeof generatedDraftSchema>): TemplateDraft {
  return templateDraftSchema.parse({
    ...output,
    variables: output.variables.map((variable, index) => ({
      ...variable,
      id: variable.id || `var-${index + 1}`,
    })),
  });
}

export async function structurePrompt(
  config: ResolvedModel,
  input: JsonRecord,
): Promise<TemplateDraft> {
  if (!hasCapability(config.model, 'text') ||
      !hasCapability(config.model, 'structured_output')) {
    throw new Error(`Model ${config.model.name} lacks text or structured_output capability`);
  }
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl : undefined;
  const text = typeof input.text === 'string' ? input.text : '';
  if (imageUrl && !hasCapability(config.model, 'vision')) {
    throw new Error(`Model ${config.model.name} does not accept image input`);
  }
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const common = {
    model: createLanguageModel(config),
    system: SYSTEM,
    output: Output.object({ schema: generatedDraftSchema }),
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(120000),
    ...defaults.language,
  };
  const result = imageUrl
    ? await generateText({
        ...common,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '请从参考图反推一个可复用的中文 AI 绘图提示词模板。' },
            { type: 'image', image: await inlineImage(imageUrl) },
          ],
        }],
      })
    : await generateText({
        ...common,
        prompt: `请优化并结构化以下需求，输出可复用的中文 AI 绘图提示词模板：\n${text}`,
      });
  return normalizeDraft(result.output);
}

export async function describeImage(config: ResolvedModel, imageUrl: string) {
  if (!hasCapability(config.model, 'vision')) {
    throw new Error(`Model ${config.model.name} lacks vision capability`);
  }
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const result = await generateText({
    model: createLanguageModel(config),
    system: '你是专业视觉分析师。详细描述图片的主体、构图、镜头、光线、材质、色彩、风格、文字和空间关系，供另一个模型重建绘图提示词。不要省略细节。',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '请完整分析这张参考图。' },
        { type: 'image', image: await inlineImage(imageUrl) },
      ],
    }],
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(120000),
    ...defaults.language,
  });
  if (!result.text.trim()) throw new Error('Vision provider returned no image description');
  return result.text;
}

export async function generateStandardImage(config: ResolvedModel, input: JsonRecord) {
  if (!hasCapability(config.model, 'image')) {
    throw new Error(`Model ${config.model.name} lacks image capability`);
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt) throw new Error('input.prompt is required');
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const size = typeof input.size === 'string' ? input.size : defaults.image.size;
  const n = typeof input.n === 'number' ? input.n : defaults.image.n;
  const result = await aiGenerateImage({
    model: createImageModel(config),
    prompt,
    ...(size ? { size: size as `${number}x${number}` } : {}),
    ...(defaults.image.aspectRatio
      ? { aspectRatio: defaults.image.aspectRatio as `${number}:${number}` }
      : {}),
    ...(n !== undefined ? { n } : {}),
    ...(defaults.image.seed !== undefined ? { seed: defaults.image.seed } : {}),
    ...(defaults.language.providerOptions
      ? { providerOptions: defaults.language.providerOptions }
      : {}),
    abortSignal: AbortSignal.timeout(300000),
  });
  return {
    images: result.images.map((image) => ({ b64_json: image.base64 })),
  };
}
```

- [ ] **Step 5: 构建并运行测试**

Run:

```bash
npm run build -w @promptix/worker
npm run test -w @promptix/worker
```

Expected：全部 PASS。允许根据锁定版本的实际请求 JSON 调整 mock 响应必需字段，但不得删除以下行为断言：模型 ID、DeepSeek thinking、变量 ID 归一化、图片内容、同步图片结果。

- [ ] **Step 6: 提交 AI Adapter**

```bash
git add apps/worker/src/ai-adapters.ts apps/worker/test/deepseek-provider.test.mjs apps/worker/test/image-provider.test.mjs
git commit -m "feat: migrate standard model calls to AI SDK"
```

---

## Task 10: 隔离并保留 65535 异步生图 Adapter

**Files:**
- Create: `apps/worker/src/async-image-adapter.ts`
- Modify: `apps/worker/src/adapters.ts`
- Modify: `apps/worker/test/image-provider.test.mjs`

- [ ] **Step 1: 让异步测试使用新 defaults 结构**

`apps/worker/test/image-provider.test.mjs` 的异步 Model 配置必须使用：

```js
defaults: {
  image: { size: '2048x2048' },
  async: {
    quality: 'high',
    responseFormat: 'url',
    pollIntervalMs: 250,
    timeoutMs: 10000,
    maxQueueSeconds: 120,
  },
},
```

Provider 的 `adapterType` 必须为 `custom_65535_async`。保留以下断言：

```js
assert.equal(init.headers['X-Async-Mode'], 'true');
assert.equal(init.headers['X-Async-Image-Max-Queue-Sec'], '120');
assert.equal(result.providerJobId, 'img_test');
assert.equal(result.costUsd, 0.18);
assert.equal(calls, 2);
```

- [ ] **Step 2: 创建独立异步 Adapter**

创建 `apps/worker/src/async-image-adapter.ts`：

```ts
import { normalizeModelDefaults, readProviderKey } from './model-defaults.js';
import { hasCapability, type ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

function endpoint(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path}`;
}

function authHeaders(config: ResolvedModel) {
  const key = readProviderKey(config.provider);
  return {
    'Content-Type': 'application/json',
    ...(key
      ? config.provider.authStyle === 'header'
        ? { 'X-API-Key': key }
        : { Authorization: `Bearer ${key}` }
      : {}),
  };
}

export async function generateAsyncImage(config: ResolvedModel, input: JsonRecord) {
  if (config.provider.adapterType !== 'custom_65535_async') {
    throw new Error('Asynchronous image adapter received a non-async provider');
  }
  if (!hasCapability(config.model, 'image')) {
    throw new Error(`Model ${config.model.name} lacks image capability`);
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt) throw new Error('input.prompt is required');
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const headers: Record<string, string> = {
    ...authHeaders(config),
    'X-Async-Mode': 'true',
  };
  if (defaults.async.maxQueueSeconds !== undefined) {
    headers['X-Async-Image-Max-Queue-Sec'] = String(defaults.async.maxQueueSeconds);
  }
  const body = {
    model: config.model.modelId,
    prompt,
    size: typeof input.size === 'string'
      ? input.size
      : defaults.image.size ?? '1024x1024',
    n: typeof input.n === 'number' ? input.n : defaults.image.n ?? 1,
    ...(defaults.async.quality ? { quality: defaults.async.quality } : {}),
    ...(defaults.async.responseFormat
      ? { response_format: defaults.async.responseFormat }
      : {}),
  };
  const response = await fetch(endpoint(config.provider.baseUrl, '/images/generations'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Image provider ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const accepted = await response.json() as {
    job_id?: string;
    status_url?: string;
    status?: string;
  };
  if (!accepted.job_id) throw new Error('Async image provider returned no job_id');
  const statusUrl = accepted.status_url
    ? new URL(accepted.status_url, config.provider.baseUrl).toString()
    : endpoint(config.provider.baseUrl, `/images/async-generations/${accepted.job_id}`);
  const pollMs = Math.min(10000, Math.max(250, defaults.async.pollIntervalMs ?? 2000));
  const timeoutMs = Math.min(3600000, Math.max(10000, defaults.async.timeoutMs ?? 900000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const polled = await fetch(statusUrl, { headers: authHeaders(config) });
    if (!polled.ok) {
      throw new Error(`Image job polling ${polled.status}: ${(await polled.text()).slice(0, 500)}`);
    }
    const envelope = await polled.json() as {
      code?: number;
      message?: string;
      data?: {
        status?: string;
        result_urls?: string[];
        error_code?: string;
        error_message?: string;
        expires_at?: string;
        cost_usd?: number;
        image_size_tier?: string;
      };
    };
    if (envelope.code !== undefined && envelope.code !== 0) {
      throw new Error(`Image provider job error: ${envelope.message ?? envelope.code}`);
    }
    const data = envelope.data;
    if (data?.status === 'done') {
      if (!data.result_urls?.length) {
        throw new Error('Image provider completed without result URLs');
      }
      return {
        images: data.result_urls.map((url) => ({ url })),
        providerJobId: accepted.job_id,
        expiresAt: data.expires_at,
        costUsd: data.cost_usd,
        sizeTier: data.image_size_tier,
      };
    }
    if (data?.status === 'failed') {
      throw new Error(`${data.error_code ?? 'image_failed'}: ${data.error_message ?? 'Image generation failed'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Image generation timed out after ${Math.round(timeoutMs / 1000)} seconds (provider job ${accepted.job_id} may still be running)`);
}
```

- [ ] **Step 3: 将原 adapters.ts 改成稳定 facade**

将 `apps/worker/src/adapters.ts` 替换为：

```ts
import { generateAsyncImage } from './async-image-adapter.js';
import {
  describeImage,
  generateStandardImage,
  structurePrompt,
} from './ai-adapters.js';
import type { ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

export { describeImage, structurePrompt };

export async function generateImage(config: ResolvedModel, input: JsonRecord) {
  return config.provider.adapterType === 'custom_65535_async'
    ? generateAsyncImage(config, input)
    : generateStandardImage(config, input);
}
```

- [ ] **Step 4: 构建并运行全部 Worker 测试**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：同步和异步生图测试均 PASS；异步测试恰好两次 fetch。

- [ ] **Step 5: 提交异步隔离**

```bash
git add apps/worker/src/async-image-adapter.ts apps/worker/src/adapters.ts apps/worker/test/image-provider.test.mjs
git commit -m "refactor: isolate async image generation adapter"
```

---

## Task 11: 实现 Model Resolver 和能力路由

**Files:**
- Create: `apps/worker/src/model-routing.ts`
- Create: `apps/worker/src/model-resolver.ts`
- Create: `apps/worker/test/model-routing.test.mjs`

- [ ] **Step 1: 先写纯路由失败测试**

创建 `apps/worker/test/model-routing.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCapabilitiesForJob,
  imageReverseNeedsVisionFallback,
  roleForJob,
} from '../dist/model-routing.js';

const model = (capabilities) => ({ name: 'Test model', capabilities });

test('maps job types to default model roles', () => {
  assert.equal(roleForJob('text_expand'), 'text');
  assert.equal(roleForJob('structure'), 'text');
  assert.equal(roleForJob('image_reverse'), 'text');
  assert.equal(roleForJob('image_generate'), 'image');
});

test('requires text and structured output for structure jobs', () => {
  assert.throws(
    () => assertCapabilitiesForJob(model(['text']), 'text_expand'),
    /structured_output/,
  );
  assert.doesNotThrow(() => assertCapabilitiesForJob(
    model(['text', 'structured_output']),
    'text_expand',
  ));
});

test('image reverse only needs fallback when primary model lacks vision', () => {
  assert.equal(imageReverseNeedsVisionFallback(
    model(['text', 'structured_output', 'vision']),
  ), false);
  assert.equal(imageReverseNeedsVisionFallback(
    model(['text', 'structured_output']),
  ), true);
});

test('image generation requires image capability', () => {
  assert.throws(
    () => assertCapabilitiesForJob(model(['text']), 'image_generate'),
    /image capability/,
  );
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：FAIL，`dist/model-routing.js` 不存在。

- [ ] **Step 3: 创建纯能力路由模块**

创建 `apps/worker/src/model-routing.ts`：

```ts
import type { JobType, ModelCapability } from '@promptix/shared';

type CapabilityModel = { name: string; capabilities: ModelCapability[] };
export type ModelRole = 'text' | 'vision' | 'image';

export function roleForJob(jobType: JobType): ModelRole | null {
  switch (jobType) {
    case 'text_expand':
    case 'structure':
    case 'image_reverse':
      return 'text';
    case 'image_generate':
      return 'image';
    case 'noop':
      return null;
  }
}

export function assertCapabilitiesForJob(model: CapabilityModel, jobType: JobType) {
  const capabilities = new Set(model.capabilities);
  if (jobType === 'image_generate') {
    if (!capabilities.has('image')) {
      throw new Error(`Model ${model.name} lacks image capability`);
    }
    return;
  }
  if (jobType === 'text_expand' || jobType === 'structure' || jobType === 'image_reverse') {
    if (!capabilities.has('text') || !capabilities.has('structured_output')) {
      throw new Error(`Model ${model.name} lacks text or structured_output capability`);
    }
  }
}

export function imageReverseNeedsVisionFallback(model: CapabilityModel) {
  return !model.capabilities.includes('vision');
}
```

- [ ] **Step 4: 创建数据库 Resolver**

创建 `apps/worker/src/model-resolver.ts`：

```ts
import { and, desc, eq } from 'drizzle-orm';
import {
  modelCapabilitySchema,
  providerAdapterSchema,
  type JobType,
} from '@promptix/shared';
import { db, providerModels, providers } from './db.js';
import { roleForJob, type ModelRole } from './model-routing.js';
import type { ResolvedModel } from './model-types.js';

function parseResolved(row: {
  provider: typeof providers.$inferSelect;
  model: typeof providerModels.$inferSelect;
}): ResolvedModel {
  return {
    provider: {
      ...row.provider,
      adapterType: providerAdapterSchema.parse(row.provider.adapterType),
    },
    model: {
      ...row.model,
      capabilities: modelCapabilitySchema.array().parse(row.model.capabilities),
    },
  };
}

async function byModelId(modelId: string) {
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(providerModels.id, modelId),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .limit(1);
  return row ? parseResolved(row) : null;
}

async function byLegacyProviderId(providerId: string) {
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(providerModels.providerId, providerId),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .orderBy(desc(providerModels.updatedAt))
    .limit(1);
  return row ? parseResolved(row) : null;
}

async function byDefaultRole(role: ModelRole) {
  const roleColumn = role === 'text'
    ? providerModels.isDefaultText
    : role === 'vision'
      ? providerModels.isDefaultVision
      : providerModels.isDefaultImage;
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(roleColumn, true),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .limit(1);
  return row ? parseResolved(row) : null;
}

export async function resolvePrimaryModel(
  jobType: JobType,
  modelId: string | null,
  providerId: string | null,
) {
  const role = roleForJob(jobType);
  if (!role) throw new Error(`Job type ${jobType} does not use a model`);
  const resolved = modelId
    ? await byModelId(modelId)
    : providerId
      ? await byLegacyProviderId(providerId)
      : await byDefaultRole(role);
  if (!resolved) {
    throw new Error(modelId
      ? `Enabled model ${modelId} was not found`
      : providerId
        ? `No enabled model exists for legacy provider ${providerId}`
        : `No enabled default ${role} model is configured`);
  }
  return resolved;
}

export async function resolveDefaultVisionModel() {
  const resolved = await byDefaultRole('vision');
  if (!resolved) throw new Error('No enabled default vision model is configured');
  return resolved;
}
```

- [ ] **Step 5: 运行测试和构建**

Run:

```bash
npm run test -w @promptix/worker
npm run build -w @promptix/worker
```

Expected：全部 PASS。

- [ ] **Step 6: 提交 Resolver**

```bash
git add apps/worker/src/model-routing.ts apps/worker/src/model-resolver.ts apps/worker/test/model-routing.test.mjs
git commit -m "feat: resolve job models by role and capability"
```

---

## Task 12: 将 Worker Job 编排切换到 Model

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: 替换 Worker import**

`loadEnvFile()` 后的动态 import 改为：

```ts
const { db, generationJobs } = await import('./db.js');
const { describeImage, generateImage, structurePrompt } = await import('./adapters.js');
const {
  resolveDefaultVisionModel,
  resolvePrimaryModel,
} = await import('./model-resolver.js');
const {
  assertCapabilitiesForJob,
  imageReverseNeedsVisionFallback,
} = await import('./model-routing.js');
```

删除不再使用的 `and`、`desc`、`or` 和 `providers` import，只保留：

```ts
import { eq } from 'drizzle-orm';
import { jobTypeSchema } from '@promptix/shared';
```

- [ ] **Step 2: 替换非 noop 分支**

把旧的 Provider 查询和 `deepseek_chat` 特判整体替换为：

```ts
const jobType = jobTypeSchema.parse(record.type);
const primary = await resolvePrimaryModel(
  jobType,
  record.modelId,
  record.providerId,
);
assertCapabilitiesForJob(primary.model, jobType);

if (record.modelId !== primary.model.id || record.providerId !== primary.provider.id) {
  await db.update(generationJobs).set({
    modelId: primary.model.id,
    providerId: primary.provider.id,
  }).where(eq(generationJobs.id, record.id));
}

if (jobType === 'image_generate') {
  output = await generateImage(primary, record.input as Record<string, unknown>);
} else if (jobType === 'image_reverse') {
  const imageUrl = (record.input as { imageUrl?: unknown }).imageUrl;
  if (typeof imageUrl !== 'string') {
    throw new Error('image_reverse job is missing input.imageUrl');
  }
  if (imageReverseNeedsVisionFallback(primary.model)) {
    const vision = await resolveDefaultVisionModel();
    const description = await describeImage(vision, imageUrl);
    output = await structurePrompt(primary, {
      text: `以下是视觉模型对参考图的详细描述。请保留视觉事实并优化为可复用模板：\n${description}`,
    });
  } else {
    output = await structurePrompt(primary, { imageUrl });
  }
} else {
  output = await structurePrompt(primary, record.input as Record<string, unknown>);
}
```

最终 control flow 必须保持：`noop` 完全不查询模型，所有数据库状态更新、成功日志、失败日志和 BullMQ 配置保持原样。

- [ ] **Step 3: 构建 Worker**

Run:

```bash
npm run build -w @promptix/worker
```

Expected：PASS；`rg -n "deepseek_chat|supportsVision|orderBy\(desc\(providers" apps/worker/src/index.ts` 无输出。

- [ ] **Step 4: 运行 Worker 全部测试**

Run:

```bash
npm run test -w @promptix/worker
```

Expected：全部 PASS。

- [ ] **Step 5: 提交 Worker 编排**

```bash
git add apps/worker/src/index.ts
git commit -m "refactor: route generation jobs through models"
```

---

## Task 13: 让 Jobs API 接受并验证 modelId

**Files:**
- Modify: `apps/api/src/routes/jobs.ts`

- [ ] **Step 1: 扩展输入合同和 import**

将 Hono import 改为：

```ts
import { Hono, type Context } from 'hono';
```

将 Schema import 改为：

```ts
import { jobTypeSchema, type JobType } from '@promptix/shared';
```

数据库 import 加入 `providerModels`：

```ts
import {
  generationJobs,
  mediaObjects,
  providerModels,
  providers,
  promptTemplates,
} from '../db/schema.js';
```

`jobInput` 改为：

```ts
const jobInput = z.object({
  type: jobTypeSchema,
  input: z.record(z.unknown()).default({}),
  modelId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  templateId: z.string().optional(),
});
```

- [ ] **Step 2: 添加模型验证 helper**

在 `enqueue` 前加入：

```ts
async function validatedModel(jobType: JobType, modelId?: string, legacyProviderId?: string) {
  if (!modelId) return { modelId: undefined, providerId: legacyProviderId };
  const [row] = await getDb().select({
    model: providerModels,
    providerEnabled: providers.enabled,
  }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(eq(providerModels.id, modelId))
    .limit(1);
  if (!row) throw new Error('MODEL_NOT_FOUND');
  if (!row.model.enabled || !row.providerEnabled) throw new Error('MODEL_DISABLED');
  if (legacyProviderId && legacyProviderId !== row.model.providerId) {
    throw new Error('MODEL_PROVIDER_MISMATCH');
  }
  const capabilities = new Set(row.model.capabilities);
  if (jobType === 'image_generate' && !capabilities.has('image')) {
    throw new Error('MODEL_CAPABILITY_MISMATCH');
  }
  if (['text_expand', 'structure', 'image_reverse'].includes(jobType) &&
      (!capabilities.has('text') || !capabilities.has('structured_output'))) {
    throw new Error('MODEL_CAPABILITY_MISMATCH');
  }
  return { modelId: row.model.id, providerId: row.model.providerId };
}

function modelValidationFailure(c: Context, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'MODEL_NOT_FOUND':
      return fail(c, code, 'Model not found', 404);
    case 'MODEL_DISABLED':
      return fail(c, code, 'Model or provider is disabled', 409);
    case 'MODEL_PROVIDER_MISMATCH':
      return fail(c, code, 'modelId and providerId refer to different providers', 409);
    case 'MODEL_CAPABILITY_MISMATCH':
      return fail(c, code, 'Model does not support this job type', 409);
    default:
      throw error;
  }
}
```

- [ ] **Step 3: 修改 JSON Job 创建**

在验证 `text_expand` input 后、insert 前加入：

```ts
let selection: { modelId?: string; providerId?: string };
try {
  selection = await validatedModel(
    parsed.data.type,
    parsed.data.modelId,
    parsed.data.providerId,
  );
} catch (error) {
  return modelValidationFailure(c, error);
}
```

insert 改为显式字段，避免把未经处理的 ID spread 进去：

```ts
const [row] = await getDb().insert(generationJobs).values({
  type: parsed.data.type,
  input: parsed.data.input,
  templateId: parsed.data.templateId,
  modelId: selection.modelId,
  providerId: selection.providerId,
  status: 'pending',
  actorId: admin.sub,
}).returning();
```

- [ ] **Step 4: 修改 multipart 图片反推**

读取表单时加入：

```ts
const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
```

图片和大小验证后加入：

```ts
let selection: { modelId?: string; providerId?: string };
try {
  selection = await validatedModel('image_reverse', modelId, providerId);
} catch (error) {
  return modelValidationFailure(c, error);
}
```

初始 Job insert 改为：

```ts
const [row] = await db.insert(generationJobs).values({
  type: 'image_reverse',
  status: 'pending',
  actorId: admin.sub,
  modelId: selection.modelId,
  providerId: selection.providerId,
  input: {},
}).returning();
```

- [ ] **Step 5: 构建 API 并检查旧输入兼容**

Run:

```bash
npm run build -w @promptix/api
rg -n "modelId|providerId" apps/api/src/routes/jobs.ts
```

Expected：build PASS；JSON 和 multipart 都支持 `modelId`，并仍保留 `providerId`。

- [ ] **Step 6: 提交 Jobs API**

```bash
git add apps/api/src/routes/jobs.ts
git commit -m "feat: validate model selection for generation jobs"
```

---

## Task 14: 创建 Provider/Model 后台管理页

**Files:**
- Create: `apps/web/src/types/adminModels.ts`
- Create: `apps/web/src/pages/admin/ProviderModelsPage.tsx`

- [ ] **Step 1: 定义后台 API 类型**

创建 `apps/web/src/types/adminModels.ts`：

```ts
export type ProviderAdapter =
  | 'openai_compatible'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom_65535_async';

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'image'
  | 'structured_output';

export type ProviderConnection = {
  id: string;
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv?: string | null;
  apiKeyConfigured: boolean;
  authStyle: 'bearer' | 'header';
  enabled: boolean;
};

export type AdminModel = {
  id: string;
  providerId: string;
  providerName: string;
  providerEnabled: boolean;
  adapterType: ProviderAdapter;
  apiKeyConfigured: boolean;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaults: Record<string, unknown>;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};
```

- [ ] **Step 2: 创建管理页基础状态与加载逻辑**

创建目录 `apps/web/src/pages/admin`，然后创建 `ProviderModelsPage.tsx`。文件顶部必须包含：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  AdminModel,
  ModelCapability,
  ProviderAdapter,
  ProviderConnection,
} from '../../types/adminModels';

const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100';
const button = 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50';
const capabilities: ModelCapability[] = ['text', 'structured_output', 'vision', 'image'];

type ProviderForm = {
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv: string;
  authStyle: 'bearer' | 'header';
  enabled: boolean;
};

type ModelForm = {
  providerId: string;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaultsText: string;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

const blankProvider = (): ProviderForm => ({
  name: '',
  adapterType: 'openai_compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnv: 'LLM_API_KEY',
  authStyle: 'bearer',
  enabled: true,
});

const blankModel = (): ModelForm => ({
  providerId: '',
  name: '',
  modelId: '',
  capabilities: ['text', 'structured_output'],
  defaultsText: '{}',
  enabled: true,
  isDefaultText: false,
  isDefaultVision: false,
  isDefaultImage: false,
});
```

- [ ] **Step 3: 实现组件行为**

在同一文件继续加入：

```tsx
export function ProviderModelsPage() {
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(blankProvider);
  const [modelForm, setModelForm] = useState<ModelForm>(blankModel);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [providerRows, modelRows] = await Promise.all([
      api<ProviderConnection[]>('/api/admin/providers'),
      api<AdminModel[]>('/api/admin/models'),
    ]);
    setProviders(providerRows);
    setModels(modelRows);
    setModelForm((current) => current.providerId || !providerRows[0]
      ? current
      : { ...current, providerId: providerRows[0].id });
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : '配置加载失败'));
  }, [load]);

  function toggleCapability(capability: ModelCapability) {
    setModelForm((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capability)
        ? current.capabilities.filter((item) => item !== capability)
        : [...current.capabilities, capability],
    }));
  }

  function loadDeepSeekPreset() {
    setProviderForm({
      name: 'DeepSeek',
      adapterType: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      authStyle: 'bearer',
      enabled: true,
    });
    setModelForm({
      ...blankModel(),
      name: 'DeepSeek V4 Pro',
      modelId: 'deepseek-v4-pro',
      capabilities: ['text', 'structured_output'],
      defaultsText: JSON.stringify({
        maxOutputTokens: 4096,
        providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
      }, null, 2),
      isDefaultText: true,
    });
    setMessage('已载入 DeepSeek 连接和模型预设；先保存 Provider，再保存 Model');
  }

  function loadAsyncImagePreset() {
    setProviderForm({
      name: '65535 Images',
      adapterType: 'custom_65535_async',
      baseUrl: 'https://img-cn.65535.space/v1',
      apiKeyEnv: 'IMAGE_65535_API_KEY',
      authStyle: 'bearer',
      enabled: true,
    });
    setModelForm({
      ...blankModel(),
      name: '65535 gpt-image-2',
      modelId: 'gpt-image-2',
      capabilities: ['image'],
      defaultsText: JSON.stringify({
        image: { size: '2048x2048', n: 1 },
        async: {
          quality: 'high',
          responseFormat: 'url',
          pollIntervalMs: 2000,
          timeoutMs: 900000,
          maxQueueSeconds: 120,
        },
      }, null, 2),
      isDefaultImage: true,
    });
    setMessage('已载入 65535 连接和模型预设；先保存 Provider，再保存 Model');
  }

  async function saveProvider() {
    setBusy(true);
    setMessage('');
    try {
      const created = await api<ProviderConnection>('/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({
          ...providerForm,
          apiKeyEnv: providerForm.apiKeyEnv || null,
        }),
      });
      setModelForm((current) => ({ ...current, providerId: created.id }));
      setMessage(`Provider ${created.name} 已保存；现在可以保存 Model`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Provider 保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function saveModel() {
    setBusy(true);
    setMessage('');
    try {
      const defaults = JSON.parse(modelForm.defaultsText) as unknown;
      if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
        throw new Error('Model defaults 必须是 JSON object');
      }
      await api('/api/admin/models', {
        method: 'POST',
        body: JSON.stringify({
          ...modelForm,
          defaults,
          defaultsText: undefined,
        }),
      });
      setMessage('Model 已保存');
      setModelForm((current) => ({ ...blankModel(), providerId: current.providerId }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function setModelEnabled(model: AdminModel, enabled: boolean) {
    try {
      await api(`/api/admin/models/${model.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 状态更新失败');
    }
  }

  async function removeModel(model: AdminModel) {
    if (!window.confirm(`确认删除 Model：${model.name}？`)) return;
    try {
      await api(`/api/admin/models/${model.id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 删除失败');
    }
  }

  async function setDefaultRole(
    model: AdminModel,
    role: 'text' | 'vision' | 'image',
  ) {
    const patch = role === 'text'
      ? { isDefaultText: true }
      : role === 'vision'
        ? { isDefaultVision: true }
        : { isDefaultImage: true };
    try {
      await api(`/api/admin/models/${model.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await load();
      setMessage(`${model.name} 已设为默认${role}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '默认用途更新失败');
    }
  }
```

- [ ] **Step 4: 实现管理页 JSX**

在组件行为后加入以下 `return`，然后闭合函数：

```tsx
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Operations</p>
        <h1 className="mt-1 text-2xl font-semibold">Providers & Models</h1>
      </div>
      <div className="flex gap-2">
        <button className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700" onClick={loadDeepSeekPreset}>DeepSeek 预设</button>
        <button className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700" onClick={loadAsyncImagePreset}>65535 预设</button>
      </div>
    </div>

    {message && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">新增 Provider 连接</h2>
        <label className="block text-sm">名称<input className={`${field} mt-1`} value={providerForm.name} onChange={(event) => setProviderForm((value) => ({ ...value, name: event.target.value }))}/></label>
        <label className="block text-sm">Adapter<select className={`${field} mt-1`} value={providerForm.adapterType} onChange={(event) => setProviderForm((value) => ({ ...value, adapterType: event.target.value as ProviderAdapter }))}>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="openai">OpenAI native</option>
          <option value="anthropic">Anthropic native</option>
          <option value="google">Google native</option>
          <option value="deepseek">DeepSeek native</option>
          <option value="custom_65535_async">65535 async images</option>
        </select></label>
        <label className="block text-sm">Base URL<input className={`${field} mt-1`} value={providerForm.baseUrl} onChange={(event) => setProviderForm((value) => ({ ...value, baseUrl: event.target.value }))}/></label>
        <label className="block text-sm">密钥环境变量名<input className={`${field} mt-1`} value={providerForm.apiKeyEnv} onChange={(event) => setProviderForm((value) => ({ ...value, apiKeyEnv: event.target.value }))}/></label>
        <label className="block text-sm">认证方式<select className={`${field} mt-1`} value={providerForm.authStyle} onChange={(event) => setProviderForm((value) => ({ ...value, authStyle: event.target.value as 'bearer' | 'header' }))}><option value="bearer">Bearer</option><option value="header">X-API-Key</option></select></label>
        <button className={`${button} w-full`} disabled={busy || !providerForm.name || !providerForm.baseUrl} onClick={saveProvider}>保存 Provider</button>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">新增 Model</h2>
        <label className="block text-sm">所属 Provider<select className={`${field} mt-1`} value={modelForm.providerId} onChange={(event) => setModelForm((value) => ({ ...value, providerId: event.target.value }))}><option value="">请选择</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">显示名称<input className={`${field} mt-1`} value={modelForm.name} onChange={(event) => setModelForm((value) => ({ ...value, name: event.target.value }))}/></label>
          <label className="block text-sm">厂商 Model ID<input className={`${field} mt-1`} value={modelForm.modelId} onChange={(event) => setModelForm((value) => ({ ...value, modelId: event.target.value }))}/></label>
        </div>
        <div><p className="mb-2 text-sm">Capabilities</p><div className="flex flex-wrap gap-3">{capabilities.map((capability) => <label key={capability} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.capabilities.includes(capability)} onChange={() => toggleCapability(capability)}/>{capability}</label>)}</div></div>
        <div><p className="mb-2 text-sm">默认用途</p><div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultText} onChange={(event) => setModelForm((value) => ({ ...value, isDefaultText: event.target.checked }))}/>文本结构化</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultVision} onChange={(event) => setModelForm((value) => ({ ...value, isDefaultVision: event.target.checked }))}/>视觉分析</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultImage} onChange={(event) => setModelForm((value) => ({ ...value, isDefaultImage: event.target.checked }))}/>图片生成</label>
        </div></div>
        <label className="block text-sm">Defaults JSON<textarea className={`${field} mt-1 min-h-52 font-mono text-xs`} value={modelForm.defaultsText} onChange={(event) => setModelForm((value) => ({ ...value, defaultsText: event.target.value }))}/></label>
        <button className={`${button} w-full`} disabled={busy || !modelForm.providerId || !modelForm.name || !modelForm.modelId || modelForm.capabilities.length === 0} onClick={saveModel}>保存 Model</button>
      </section>
    </div>

    <section className="mt-6 space-y-4">
      {providers.map((provider) => <div key={provider.id} className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{provider.name}</h2><p className="mt-1 text-xs text-gray-500">{provider.adapterType} · {provider.baseUrl}</p></div><span className={`rounded-full px-2 py-1 text-xs ${provider.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{provider.enabled ? 'enabled' : 'disabled'} · key {provider.apiKeyConfigured ? '✓' : '未配置'}</span></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{models.filter((model) => model.providerId === provider.id).map((model) => <div key={model.id} className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{model.name}</b><p className="mt-1 font-mono text-xs text-gray-500">{model.modelId}</p></div><div className="flex gap-2"><button className="text-xs text-violet-600" onClick={() => setModelEnabled(model, !model.enabled)}>{model.enabled ? '停用' : '启用'}</button><button className="text-xs text-red-600" onClick={() => removeModel(model)}>删除</button></div></div>
          <p className="mt-3 text-xs text-gray-500">{model.capabilities.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">{model.isDefaultText && <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">默认文本</span>}{model.isDefaultVision && <span className="rounded bg-cyan-100 px-2 py-1 text-cyan-700">默认视觉</span>}{model.isDefaultImage && <span className="rounded bg-violet-100 px-2 py-1 text-violet-700">默认生图</span>}</div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{model.capabilities.includes('text') && model.capabilities.includes('structured_output') && !model.isDefaultText && <button className="text-blue-600" onClick={() => setDefaultRole(model, 'text')}>设为默认文本</button>}{model.capabilities.includes('vision') && !model.isDefaultVision && <button className="text-cyan-600" onClick={() => setDefaultRole(model, 'vision')}>设为默认视觉</button>}{model.capabilities.includes('image') && !model.isDefaultImage && <button className="text-violet-600" onClick={() => setDefaultRole(model, 'image')}>设为默认生图</button>}</div>
        </div>)}</div>
      </div>)}
    </section>
  </>;
}
```

- [ ] **Step 5: 构建 Web**

Run:

```bash
npm run build -w @promptix/web
```

Expected：PASS。不得通过关闭 `noUnusedLocals` 或使用 `any` 解决错误。

- [ ] **Step 6: 提交管理页**

```bash
git add apps/web/src/types/adminModels.ts apps/web/src/pages/admin/ProviderModelsPage.tsx
git commit -m "feat: add provider and model management page"
```

---

## Task 15: 将 Admin 路由和智能入库切换到 Model

**Files:**
- Modify: `apps/web/src/pages/AdminPage.tsx`

- [ ] **Step 1: 添加 import 并删除旧 Provider 类型**

在 import 区加入：

```ts
import { ProviderModelsPage } from './admin/ProviderModelsPage';
import type { AdminModel } from '../types/adminModels';
```

删除本文件的旧 `type Provider=...`。不要删除 `Job`、`Template` 或 `DraftForm`。

- [ ] **Step 2: 切换后台导航和路由**

将导航文字：

```tsx
<Nav to="/admin/providers">Providers</Nav>
```

改为：

```tsx
<Nav to="/admin/providers">模型</Nav>
```

将路由 element：

```tsx
<Route path="providers" element={<Providers/>}/>
```

改为：

```tsx
<Route path="providers" element={<ProviderModelsPage/>}/>
```

删除本文件整个旧 `function Providers(){...}`。

- [ ] **Step 3: 将 Ingest 状态切换到 Model**

在 `Ingest` 中把：

```ts
const [providerItems,setProviderItems]=useState<Provider[]>([]);
const [providerId,setProviderId]=useState('');
```

替换为：

```ts
const [modelItems, setModelItems] = useState<AdminModel[]>([]);
const [modelId, setModelId] = useState('');
```

加载逻辑替换为：

```ts
useEffect(() => {
  api<AdminModel[]>('/api/admin/models?capability=text').then((list) => {
    const eligible = list.filter((model) =>
      model.enabled &&
      model.providerEnabled &&
      model.capabilities.includes('structured_output'));
    setModelItems(eligible);
    const preferred = eligible.find((model) => model.isDefaultText) ?? eligible[0];
    if (preferred) setModelId(preferred.id);
  }).catch((error) => setMessage(error instanceof Error ? error.message : 'Model 加载失败'));
}, []);
```

- [ ] **Step 4: 修改 Job 请求**

图片 multipart：

```ts
if (modelId) body.set('modelId', modelId);
```

文本 JSON：

```ts
body: JSON.stringify({
  type: 'text_expand',
  input: { text },
  modelId: modelId || undefined,
})
```

不得再发送 `providerId`。

- [ ] **Step 5: 修改 Model 下拉框**

把旧 Provider select 整段替换为：

```tsx
<label className="mt-4 block text-sm">优化与结构化模型
  <select className={`${field} mt-1`} value={modelId} onChange={(event) => setModelId(event.target.value)}>
    <option value="">请选择模型</option>
    {modelItems.map((model) => <option key={model.id} value={model.id}>
      {model.providerName} · {model.name} · {model.modelId}
    </option>)}
  </select>
</label>
<p className="mt-2 text-xs leading-5 text-gray-500">
  模型支持 vision 时直接反推图片；否则先调用默认视觉模型描述图片，再由所选模型结构化。
</p>
```

提交按钮 disabled 改为：

```tsx
disabled={(!text && !file) || !modelId}
```

- [ ] **Step 6: 全仓搜索旧 UI 依赖**

Run:

```bash
rg -n "providerItems|setProviderItems|providerId|defaultModel|supportsVision|function Providers" apps/web/src/pages/AdminPage.tsx
```

Expected：不再出现 Provider 下拉框相关标识。若模板封面生成仍不传 modelId，这是预期行为，它使用默认生图模型。

- [ ] **Step 7: 构建和 lint Web**

Run:

```bash
npm run build -w @promptix/web
npm run lint -w @promptix/web
```

Expected：全部 PASS。

- [ ] **Step 8: 提交 Admin 集成**

```bash
git add apps/web/src/pages/AdminPage.tsx
git commit -m "feat: select models for prompt ingestion"
```

---

## Task 16: 更新环境变量、README 和运维手册

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/ops.md`

- [ ] **Step 1: 增加原生 Provider key 示例**

将 `.env.example` 的 Provider key 区域改为：

```dotenv
# Optional provider keys (database stores only these environment variable names)
LLM_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
DEEPSEEK_API_KEY=
IMAGE_API_KEY=
IMAGE_65535_API_KEY=
```

不要新增 `AI_GATEWAY_API_KEY`。

- [ ] **Step 2: 更新 README 的后台路由和架构说明**

把 `/admin/providers` 的说明改为：

```markdown
| `/admin/providers` | Provider 连接与多模型配置 |
```

Provider 说明替换为：

```markdown
- Provider 保存 Adapter、Base URL、认证方式和密钥环境变量名；密钥值不进入数据库。
- 一个 Provider 可以配置多个 Model；Model 保存厂商模型 ID、能力、默认用途和调用默认值。
- 文本、视觉、结构化输出和标准同步生图通过 Vercel AI SDK 7 调用。
- `custom_65535_async` 保留提交与轮询 Adapter，不经过 AI SDK 同步生图流程。
- Job 优先保存 `modelId`，并同步保存 `providerId` 以兼容历史任务。
```

- [ ] **Step 3: 更新运维手册**

在 `docs/ops.md` 增加：

```markdown
## 模型配置与默认用途

1. 先创建 Provider 连接，选择固定 Adapter，填写 Base URL 和密钥环境变量名。
2. 再在该 Provider 下创建一个或多个 Model，Model ID 必须与厂商 API 完全一致。
3. 文本结构化默认模型必须具备 `text` 和 `structured_output`。
4. 默认视觉模型必须具备 `vision`；非视觉文本模型执行图片反推时会调用它完成第一阶段描述。
5. 默认生图模型必须具备 `image`。
6. 三类默认用途全库各最多一个；停用或删除默认 Model 前必须先把默认用途转移给另一个 Model。

## Node 与 AI SDK 版本策略

- API、Worker 和构建环境统一使用 Node.js 22。
- Worker 固定使用 AI SDK 7 和本计划列出的 Provider 精确版本。
- 升级 AI SDK 主版本必须单独立项，不与业务功能修改混合。
- 本项目默认直连 Provider，不依赖 Vercel AI Gateway。

## Provider 故障排查

- `MODEL_NOT_FOUND`：后台选择的 Model 已被删除，重新选择有效 Model。
- `MODEL_DISABLED`：Model 或所属 Provider 已停用。
- `MODEL_CAPABILITY_MISMATCH`：Model 能力与 Job 类型不匹配。
- `No enabled default text model is configured`：设置一个 `text + structured_output` 默认模型。
- `No enabled default vision model is configured`：为双阶段图片反推设置默认视觉模型。
- `No enabled default image model is configured`：设置默认生图模型。
- `Provider key environment variable ... is not set`：在 API 和 Worker 进程环境中配置对应变量并重启。
```

- [ ] **Step 4: 文档搜索校验**

Run:

```bash
rg -n "一个 Provider|provider_models|AI SDK 7|Node.js 22|custom_65535_async|默认视觉" README.md docs/ops.md
rg -n "AI_GATEWAY_API_KEY" .env.example README.md docs/ops.md
```

Expected：第一条能找到新说明；第二条无输出。

- [ ] **Step 5: 提交文档**

```bash
git add .env.example README.md docs/ops.md
git commit -m "docs: explain provider model operations"
```

---

## Task 17: 做完整数据库迁移演练

**Files:**
- Verify: `apps/api/drizzle/0000_shiny_gateway.sql`
- Verify: `apps/api/drizzle/0001_shiny_emma_frost.sql`
- Verify: `apps/api/drizzle/0002_ai_sdk_model_registry.sql`

- [ ] **Step 1: 创建只用于演练的数据库**

Run:

```bash
dropdb --if-exists promptix_migration_rehearsal
createdb promptix_migration_rehearsal
psql -v ON_ERROR_STOP=1 postgresql://localhost:5432/promptix_migration_rehearsal \
  -f apps/api/drizzle/0000_shiny_gateway.sql \
  -f apps/api/drizzle/0001_shiny_emma_frost.sql
```

Expected：旧 Schema 创建成功。

- [ ] **Step 2: 插入迁移前 Provider 和 Job 样本**

Run:

```bash
psql -v ON_ERROR_STOP=1 postgresql://localhost:5432/promptix_migration_rehearsal <<'SQL'
WITH deepseek_provider AS (
  INSERT INTO providers (
    name, kind, protocol, base_url, api_key_env,
    default_model, defaults, auth_style, is_default, enabled
  ) VALUES (
    'Legacy DeepSeek', 'llm', 'deepseek_chat', 'https://api.deepseek.com',
    'DEEPSEEK_API_KEY', 'deepseek-v4-pro',
    '{"supportsVision":false,"thinking":{"type":"disabled"},"max_tokens":4096}'::jsonb,
    'bearer', true, true
  ) RETURNING id
)
INSERT INTO generation_jobs (type, status, provider_id, input)
SELECT 'text_expand', 'failed', id, '{"text":"legacy"}'::jsonb
FROM deepseek_provider;

INSERT INTO providers (
  name, kind, protocol, base_url, api_key_env,
  default_model, defaults, auth_style, is_default, enabled
) VALUES (
  'Legacy 65535', 'image', 'openai_images_async',
  'https://img-cn.65535.space/v1', 'IMAGE_65535_API_KEY',
  'gpt-image-2',
  '{"size":"2048x2048","quality":"high","maxQueueSeconds":120}'::jsonb,
  'bearer', true, true
);
SQL
```

Expected：两个 Provider、一个带 `provider_id` 且没有 `model_id` 的 Job。

- [ ] **Step 3: 直接执行 0002 迁移**

Run:

```bash
psql -v ON_ERROR_STOP=1 postgresql://localhost:5432/promptix_migration_rehearsal \
  -f apps/api/drizzle/0002_ai_sdk_model_registry.sql
```

Expected：命令成功且没有唯一索引冲突。

- [ ] **Step 4: 验证回填结果**

Run:

```bash
psql -P pager=off postgresql://localhost:5432/promptix_migration_rehearsal <<'SQL'
SELECT p.name, p.adapter_type, pm.model_id, pm.capabilities,
       pm.is_default_text, pm.is_default_vision, pm.is_default_image
FROM providers p
JOIN provider_models pm ON pm.provider_id = p.id
ORDER BY p.name;

SELECT count(*) AS providers_without_model
FROM providers p
LEFT JOIN provider_models pm ON pm.provider_id = p.id
WHERE pm.id IS NULL;

SELECT count(*) AS provider_jobs_without_model
FROM generation_jobs
WHERE provider_id IS NOT NULL AND model_id IS NULL;

SELECT
  count(*) FILTER (WHERE is_default_text) AS default_text_count,
  count(*) FILTER (WHERE is_default_vision) AS default_vision_count,
  count(*) FILTER (WHERE is_default_image) AS default_image_count
FROM provider_models;
SQL
```

Expected：

- DeepSeek Adapter 为 `deepseek`，能力包含 `text` 和 `structured_output`。
- 65535 Adapter 为 `custom_65535_async`，能力包含 `image`。
- `providers_without_model = 0`。
- `provider_jobs_without_model = 0`。
- 三个 default count 均不大于 `1`。

- [ ] **Step 5: 验证迁移幂等边界**

不要第二次直接执行完整 0002 SQL，因为 DDL 本身不是幂等迁移。改为通过正式迁移器对已经完成迁移的数据库运行两次：

```bash
DATABASE_URL=postgresql://localhost:5432/promptix_ai_sdk_test npm run db:migrate
DATABASE_URL=postgresql://localhost:5432/promptix_ai_sdk_test npm run db:migrate
```

Expected：两次都输出 `[migrate] done`，第二次不重复执行 migration。

- [ ] **Step 6: 删除演练数据库**

```bash
dropdb promptix_migration_rehearsal
```

Expected：成功。本 Task 不创建 commit。

---

## Task 18: 全仓自动化验证

**Files:**
- Verify all changed files

- [ ] **Step 1: 从锁文件重新安装**

Run:

```bash
npm ci
```

Expected：成功，无 lockfile 漂移。执行后 `git status --short` 不应出现新的 package 文件修改。

- [ ] **Step 2: 运行所有测试**

Run:

```bash
npm test
```

Expected：共享合同、Model Factory、路由、DeepSeek、视觉、同步图片和异步图片测试全部 PASS；测试数量不少于 Task 1 基线加本计划新增数量。

- [ ] **Step 3: 运行所有构建**

Run:

```bash
npm run build
```

Expected：shared、web、api、worker 全部 PASS。

- [ ] **Step 4: 运行 lint**

Run:

```bash
npm run lint
```

Expected：PASS。

- [ ] **Step 5: 运行危险模式搜索**

Run:

```bash
rg -n "apiKeyEncrypted|process\.env\[[^]]+\].*console|console\.(log|error).*apiKey|AI_GATEWAY_API_KEY" apps packages .env.example
rg -n "fetch\(.*chat/completions|/chat/completions" apps/worker/src
rg -n "DROP TABLE|DROP COLUMN|TRUNCATE" apps/api/drizzle/0002_ai_sdk_model_registry.sql
```

Expected：

- 第一条只允许看到现有 `apiKeyEncrypted` 被安全剔除的代码，不能看到密钥日志或 Gateway key。
- 第二条无输出；标准文本请求完全交给 AI SDK。
- 第三条无输出。

- [ ] **Step 6: 检查 Git 范围**

Run:

```bash
git status --short
git diff --stat main..HEAD
git log --oneline --decorate -15
```

Expected：工作区为空；提交主题与每个 Task 对应；没有用户原始 macOS binding 修改被重新改写。

---

## Task 19: 本地 UI 和真实 Provider 验收

**Files:**
- No committed fixture or secret files

- [ ] **Step 1: 准备本地服务**

使用非生产数据库和 Redis，复制 `.env.example` 为本地 `.env`，只在本机填入测试密钥。确保 `.env` 已被 `.gitignore` 忽略：

```bash
git check-ignore .env
npm run db:migrate
npm run db:seed
npm run dev
```

Expected：API、Worker、Web、shared watcher 均启动；Worker 输出 `worker_ready`。

- [ ] **Step 2: 验收 Provider/Model 管理页**

在浏览器登录 `/admin/providers`，完成：

1. 新建一个 DeepSeek Provider。
2. 在该 Provider 下新增 `deepseek-v4-pro`，能力为 `text + structured_output`，设为默认文本。
3. 在同一 Provider 下新增第二个文本模型，确认无需新增 Provider。
4. 新建 65535 Provider 和 `gpt-image-2` Model，能力为 `image`，设为默认生图。
5. 尝试给没有 `vision` 的模型勾选默认视觉，预期 API 返回校验错误。
6. 尝试停用默认文本模型，预期返回 `DEFAULT_MODEL_DISABLE_FORBIDDEN`。

Expected：页面刷新后配置仍在；一个 Provider 下能显示多个 Model。

- [ ] **Step 3: 验收 DeepSeek 文本结构化**

在 `/admin/ingest` 选择 DeepSeek V4 Pro，提交一个短提示词。等待 Job 完成。

Expected：

- Job 状态为 `succeeded`。
- `output` 满足 `TemplateDraft`。
- 每个 variable 都有稳定 `var-N` ID。
- 数据库 Job 同时有 `model_id` 和对应 `provider_id`。
- Worker 日志没有 API key、完整 Authorization header 或模型原始隐藏推理。

- [ ] **Step 4: 验收图片反推两条路径**

路径 A：选择具备 `vision + text + structured_output` 的模型上传图片，预期只调用一个模型。

路径 B：选择不具备 vision 的 DeepSeek 模型，且设置一个默认视觉模型，上传图片，预期先视觉描述、再 DeepSeek 结构化。

Expected：两条路径均成功。临时图片仍遵循现有 10MB 限制和 7 天清理策略。

- [ ] **Step 5: 验收 65535 异步生图**

从模板编辑器生成封面。

Expected：

- 首次响应接受 `job_id`。
- Worker 按配置轮询。
- Job 输出保留 `providerJobId`、`expiresAt`、`costUsd`、`sizeTier`。
- 成功图可以通过现有 `set-cover` 流程写入存储。

- [ ] **Step 6: 验收历史 Job retry**

在迁移演练库或脱敏副本中选择一个只有旧 `provider_id` 的 failed Job，执行 retry。

Expected：Worker 通过该 Provider 的回填 Model 执行，并把实际 `model_id` 写回 Job。

---

## Task 20: 发布、观测和回滚

**Files:**
- No additional code changes unless a verified defect is found

- [ ] **Step 1: 发布前备份**

停止 API/Worker 写入后执行：

```bash
BACKUP="promptix-before-ai-sdk-$(date +%Y%m%d-%H%M%S).dump"
pg_dump -Fc "$DATABASE_URL" > "$BACKUP"
pg_restore --list "$BACKUP" | head
```

Expected：dump 文件非空，`pg_restore --list` 可以读取目录。把备份复制到部署主机之外的位置。

- [ ] **Step 2: 按固定顺序发布**

严格顺序：

1. 保持 API/Worker 停止。
2. 执行 `npm ci`。
3. 执行 `npm run build`。
4. 执行 `npm run db:migrate`。
5. 执行下方 SQL gate。
6. 同时启动新 API 和新 Worker。
7. 发布 Web 静态资源。
8. 完成一个 noop、一个文本 Job、一个图片 Job。

SQL gate：

```sql
SELECT count(*) AS providers_without_model
FROM providers p
LEFT JOIN provider_models pm ON pm.provider_id = p.id
WHERE pm.id IS NULL;

SELECT count(*) AS provider_jobs_without_model
FROM generation_jobs
WHERE provider_id IS NOT NULL AND model_id IS NULL;
```

Expected：两个 count 都是 `0`。任何一个非零都停止启动服务。

- [ ] **Step 3: 观测首批任务**

发布后至少检查：

```sql
SELECT type, status, count(*)
FROM generation_jobs
WHERE created_at > now() - interval '1 hour'
GROUP BY type, status
ORDER BY type, status;
```

同时搜索 Worker 日志中的：

```text
MODEL_NOT_FOUND
MODEL_DISABLED
MODEL_CAPABILITY_MISMATCH
No enabled default
NoObjectGeneratedError
Image generation timed out
```

Expected：没有系统性失败；单个厂商错误能在 Job `errorMessage` 中定位，但不泄露密钥。

- [ ] **Step 4: 应用层回滚方法**

若新版本有缺陷但数据库迁移成功：

1. 停止新 API/Worker。
2. 部署上一个应用版本。
3. 不删除 `provider_models`、`adapter_type` 或 `model_id`。
4. 启动旧 API/Worker。
5. 旧版本继续使用迁移前就存在的 Provider 旧列；新增表和列被忽略。升级后新建的 Provider/Model 在旧版本中不保证可调用，恢复新版本后才重新可用。

这就是保留兼容列的原因。应用回滚不得运行任何 DROP SQL。

- [ ] **Step 5: 数据库灾难恢复方法**

仅当迁移损坏数据且应用回滚无法恢复服务时：

1. 停止所有写入。
2. 创建新的空数据库。
3. 从 Task 20 Step 1 的 dump 执行 `pg_restore`。
4. 将 API/Worker 指向恢复库。
5. 验证旧版本 noop 和 Provider Job 后切流量。

不得在原生产库上手工逆向删除列或表。

---

## 3. 最终验收清单

执行者只有在全部条件满足时才能声称完成：

- [ ] 一个 Provider 下可以创建至少两个 Model。
- [ ] Provider 密钥仍只保存环境变量名。
- [ ] 文本和视觉标准调用不再手拼 `/chat/completions`。
- [ ] TemplateDraft 使用 AI SDK `Output.object` 并经过最终 Zod parse。
- [ ] 标准同步图片走 AI SDK。
- [ ] 65535 异步图片仍提交并轮询，厂商元数据完整。
- [ ] Job 新请求使用 `modelId`，数据库同时记录 `providerId`。
- [ ] 只有旧 `providerId` 的 Job 可以 retry。
- [ ] 默认文本、视觉、生图模型各最多一个。
- [ ] 无对应能力的模型不能设为相应默认用途。
- [ ] 迁移不删除任何旧列、表或数据。
- [ ] `npm test`、`npm run build`、`npm run lint` 全部通过。
- [ ] 迁移演练、UI 验收和至少一个真实文本 Provider 验收通过。
- [ ] `git status --short` 为空。

---

## 4. 交给 DeepSeek V4 Pro 的启动指令

将下面文字和本文件路径一起交给执行模型：

```text
你正在实现 Promptix 的 Provider/Model Registry 和 Vercel AI SDK 迁移。

唯一执行规范是：
docs/superpowers/plans/2026-07-16-vercel-ai-sdk-provider-model-registry.md

开始前完整阅读该文档。严格从 Task 1 顺序执行；一次只执行一个 Task。每个 checkbox 完成后记录命令和结果，每个 Task 的测试通过后按文档提交。不要跳过失败测试，不要改变固定的 Node 22、AI SDK 7 和 Provider 包版本，不要引入 Vercel AI Gateway，不要删除旧数据库列，不要把 65535 异步协议改成同步 generateImage。

遇到文档列出的停止条件、现有未提交修改、类型/API 与锁定依赖不一致、迁移包含破坏性 SQL、测试或真实 Provider 验收失败时立即停止，报告：
1. 当前 Task 和 Step；
2. 执行的精确命令；
3. 完整错误摘要；
4. 已修改文件；
5. 推荐的最小修正。

不得为了继续执行而使用 any、跳过测试、删除断言、隐藏错误、打印密钥、reset 用户修改或自行扩大任务范围。完成前重新运行 npm test、npm run build、npm run lint，并逐项核对最终验收清单。没有真实证据时不要声称“完成”或“保证无误”。
```

---

## 5. 官方参考（固定版本语义优先）

- AI SDK 7 Provider Management: <https://ai-sdk.dev/v7/docs/ai-sdk-core/provider-management>
- AI SDK 7 Structured Data: <https://ai-sdk.dev/v7/docs/ai-sdk-core/generating-structured-data>
- AI SDK 7 DeepSeek: <https://ai-sdk.dev/v7/providers/ai-sdk-providers/deepseek>
- OpenAI-compatible package: <https://www.npmjs.com/package/@ai-sdk/openai-compatible/v/3.0.11>
- AI SDK 7 Image Generation: <https://ai-sdk.dev/v7/docs/ai-sdk-core/image-generation>

如果在线最新文档与锁定包类型定义冲突，以 `node_modules` 中固定版本的 `.d.ts` 和本计划的版本决定为准，不得静默升级主版本。
