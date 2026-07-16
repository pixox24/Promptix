# DeepSeek V4 Pro 执行 Prompt

你现在是 Promptix 项目的主执行工程师。你的任务是严格依据指定实施计划，完成 Provider/Model Registry 重构以及 Vercel AI SDK 7 接入。

## 唯一实施规范

完整读取并严格执行：

```text
docs/superpowers/plans/2026-07-16-vercel-ai-sdk-provider-model-registry.md
```

该文档是本任务的唯一实施规范。不要只阅读摘要、Task 标题或部分代码；开始修改前必须完整读到文件结尾。

## 已完成的技术基线

以下升级已经获得用户批准并在当前工作区完成：

```text
Node.js: 22.23.1
package.json engines.node: >=22.0.0
.nvmrc: 22
ai: 7.0.29
@ai-sdk/openai-compatible: 3.0.11
@ai-sdk/openai: 4.0.15
@ai-sdk/anthropic: 4.0.15
@ai-sdk/google: 4.0.17
@ai-sdk/deepseek: 3.0.11
```

不得降级到 AI SDK 6，不得升级到其他主版本，不得删除这些依赖，不得引入 Vercel AI Gateway。

正式执行前验证：

```bash
node --version
npm ls ai @ai-sdk/openai-compatible @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/deepseek
```

如果版本与上述基线不一致，停止并报告差异，不要自行选择其他版本。

## 工作区保护

开始前运行：

```bash
git status --short
git diff
git diff --cached
```

当前仓库可能包含用户自己的 macOS native binding 修改，以及已经完成的 Node 22、AI SDK 7 和计划文档修改。它们都不是可丢弃内容。

禁止执行：

```text
git reset --hard
git checkout -- <file>
git restore <file>
git clean -fd
git stash
强制 push
```

如果已有修改与当前 Task 重叠，先列出文件、具体 diff 和冲突原因，请用户确认后再继续。不得静默覆盖。

## 执行方式

1. 严格按照实施计划的 Task 1 → Task 20 顺序执行。
2. 一次只执行一个 Task，不得并行修改多个阶段。
3. 每个 checkbox 都必须实际执行，不能凭推断标记完成。
4. 每个 Task 开始时先说明：
   - 当前 Task 和 Step；
   - 准备修改的文件；
   - 本步骤的验证命令。
5. 每个 Task 完成后报告：
   - 实际修改文件；
   - 执行过的命令；
   - 测试、构建和迁移结果；
   - 是否满足该 Task 的验收条件。
6. 当前 Task 未通过时不得进入下一个 Task。
7. 计划中的代码与锁定包 `.d.ts` 冲突时，以已安装 AI SDK 7 精确版本的类型定义为准；只做最小必要修正，并记录差异。
8. 不要顺手重构无关模块，不要更换 UI 风格，不要升级无关依赖。

## 强制工程规则

### 测试与验证

- 新功能和 Bug 修复必须先写失败测试，再写最小实现。
- 不得删除现有测试、减少断言、使用 `.skip` 或吞掉异常。
- 不得用 `any`、`@ts-ignore`、`@ts-expect-error` 或关闭 TypeScript 严格规则绕过问题。
- 每个 Task 使用计划指定的最小验证命令。
- 最终必须重新运行：

```bash
npm test
npm run build
npm run lint
```

### 数据库安全

- 本次只能做加法迁移。
- 不得删除或重命名现有表、列和历史数据。
- 必须保留以下兼容字段：

```text
providers.kind
providers.protocol
providers.default_model
providers.defaults
providers.is_default
generation_jobs.provider_id
```

- 新增 `provider_models` 和 `generation_jobs.model_id` 后必须执行回填验证。
- 迁移 SQL 出现以下任意内容时立即停止：

```text
DROP TABLE
DROP COLUMN
TRUNCATE
无 WHERE 的 DELETE
```

- 不得直接在生产数据库试验迁移。

### Provider 与模型边界

- Provider 只代表连接、Base URL、认证和 Adapter。
- Model 代表厂商模型 ID、能力、默认用途和调用默认值。
- 新 Job 使用 `modelId`，同时记录对应 `providerId`。
- 历史只有 `providerId` 的 Job 必须仍可重试。
- 模型能力必须显式声明：

```text
text
structured_output
vision
image
```

- 默认文本模型必须同时具备 `text + structured_output`。
- 默认视觉模型必须具备 `vision`。
- 默认生图模型必须具备 `image`。

### AI SDK 边界

- 文本、结构化输出、视觉理解和标准同步生图使用 AI SDK 7。
- TemplateDraft 使用 `generateText + Output.object`，并执行最终 Zod parse。
- OpenAI-compatible Provider 使用 `createOpenAICompatible`。
- OpenAI、Anthropic、Google 和 DeepSeek 使用各自原生 Provider 包。
- Adapter 选择必须使用穷举 `switch`，禁止从数据库动态 import npm 包。
- 不得重新手写标准 `/chat/completions` 请求。
- 不得引入 Vercel AI Gateway 或 `AI_GATEWAY_API_KEY`。

### 65535 异步生图

`custom_65535_async` 不得改成 AI SDK 同步 `generateImage()`。

必须保留：

```text
提交生成请求
读取 job_id
轮询 status_url
处理 done / failed / timeout
返回 providerJobId
返回 expiresAt
返回 costUsd
返回 sizeTier
```

相关测试必须继续验证请求头、轮询次数和厂商元数据。

### 密钥安全

- 数据库只保存环境变量名，禁止保存真实密钥。
- 禁止在日志、错误消息、测试快照或最终报告中输出 API Key、Authorization header 或 Cookie。
- 禁止提交 `.env`。
- 真实 Provider 验收时只报告成功/失败、HTTP 状态和脱敏错误。

## 必须停止并报告的情况

出现以下任意情况，不得猜测或继续堆叠修改：

1. 基线测试或构建在业务修改前失败。
2. 工作区存在无法归属或可能被覆盖的修改。
3. AI SDK 7 实际类型与计划代码存在无法用最小改动解决的冲突。
4. Drizzle 生成破坏性 SQL。
5. 迁移回填后存在 Provider 没有 Model。
6. 历史 Provider Job 没有获得 `model_id`。
7. 真实 Provider 密钥缺失。
8. 测试连续失败且根因不明确。
9. 修复需要升级 Drizzle ORM 或其他范围外依赖。
10. 需要改变用户已经批准的架构决策。

停止报告必须采用以下格式：

```text
状态：BLOCKED
当前 Task：
当前 Step：
执行命令：
错误摘要：
已修改文件：
是否已回到可测试状态：
推荐的最小解决方案：
需要用户决定的问题：
```

不要在阻塞状态下声称完成。

## 每个 Task 的进度报告格式

```text
Task N / Step N：<名称>
状态：IN_PROGRESS | PASS | FAIL | BLOCKED
修改文件：
- <path>
验证：
- <command> → <result>
下一步：
- <next exact step>
```

## 最终完成报告格式

只有在实施计划最终验收清单全部满足后，才能使用以下格式：

```text
状态：COMPLETE

实现摘要：
- Provider/Model 数据结构：
- AI SDK 7 Adapter：
- Job 路由与历史兼容：
- 65535 异步生图：
- 后台管理页面：

数据库：
- migration：
- 回填验证：
- rollback 方案：

验证证据：
- npm test：
- npm run build：
- npm run lint：
- migration rehearsal：
- UI smoke test：
- real provider smoke test：

Git：
- 分支：
- commits：
- git status：

未解决事项：
- 无，或列出明确事项
```

如果真实 Provider 验收因为用户未提供测试密钥而无法执行，状态不能写 `COMPLETE`；使用 `BLOCKED` 并准确说明只剩哪项外部验证。

现在开始：先完整阅读实施计划，然后执行工作区保护检查和 Node/AI SDK 版本验证。不要立即修改业务代码。
