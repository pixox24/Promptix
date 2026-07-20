# 图片反推自动封面编排优化方案

> 状态：可执行设计，尚未实施
>
> 编写日期：2026-07-19
>
> 适用范围：后台智能入库、图片反推、模板校对、模板编辑、管理员封面生成

## 1. 摘要

本方案将图片反推流程从“生成模板草稿后人工保存，再进入编辑页手动生成封面”优化为“保存模板即触发封面编排”。管理员只需要在图片反推结果中完成一次校对并点击“保存模板”，系统随后自动完成：模板保存、封面请求构造、封面任务入队、编辑页跳转、任务状态展示以及成功后的封面落盘。

核心原则是：

- 保存操作是唯一必要的人工确认点。
- 封面生成自动执行，但不阻塞模板保存。
- 实际发送给生图模型的内容在任务创建时冻结并可审计。
- 模板修改与封面任务绑定版本，旧任务不得覆盖新版本结果。
- 失败只影响封面任务，不回滚已保存模板。
- 手动编辑已有模板和图片反推新模板使用不同的自动化策略，避免意外覆盖线上封面。

## 2. 当前实现与问题

当前图片反推链路为：

```text
上传图片
  -> 视觉模型
  -> 模板结构化模型
  -> 质量检查
  -> TemplateDraftReview 校对
  -> POST /api/admin/templates
  -> 跳转 /admin/templates/:id
  -> 管理员再次点击“生成封面”
```

当前关键代码边界：

- `apps/web/src/components/admin/ingest/TemplateDraftReview.tsx` 的 `save()` 只创建模板并导航。
- `apps/web/src/pages/AdminPage.tsx` 的 `generate()` 另外创建 `image_generate` 任务。
- `apps/api/src/routes/jobs.ts` 当前在通用管理员 job 路由中构造模板封面 prompt。
- 普通用户生成已通过共享 `renderPromptTemplate` 渲染变量；管理员封面必须复用同一渲染规则。

当前问题：

1. 图片反推工作流不是闭环，保存后还需一次额外点击。
2. 用户可能保存模板后离开页面，封面不会生成。
3. 前端无法在保存响应中立即获得封面任务和实际请求内容。
4. 模板后续修改可能导致旧封面任务与新模板内容不一致。
5. 生图失败和模板保存耦合不清晰，容易造成重复提交或误判。
6. 封面 prompt 构造逻辑位于通用 job 路由，不便于复用、测试和版本化。

## 3. 目标与非目标

### 3.1 目标

1. 图片反推结果保存后自动创建封面生成任务。
2. 保存接口一次返回模板和封面任务摘要，前端无需发起第二个“生成”请求。
3. 编辑模板页自动展示本次实际请求内容和实时生成状态。
4. 封面请求包含渲染后的 prompt、negative prompt、aspect ratio、默认变量解析和模板版本指纹。
5. 相同模板版本重复保存时保持幂等，不重复创建封面任务。
6. 模板内容变化后自动创建新版本任务，旧任务结果不得覆盖新版本。
7. 新建图片反推模板默认成功后自动设为封面。
8. 已存在封面的模板修改后默认不自动覆盖旧封面，只展示新生成结果并提供替换操作。
9. 模板保存成功不依赖生图 Provider 成功；封面失败可单独重试。
10. 保留生成后审计信息，便于核查“实际发送了什么”。

### 3.2 非目标

- 不在本阶段引入通用工作流编排平台。
- 不自动发布模板。
- 不允许公开用户触发管理员封面编排接口。
- 不把视觉模型或模板结构化模型的流程重新设计为第三个阶段。
- 不允许前端成为最终 prompt 的可信来源。
- 不通过放宽模板 schema 来处理缺失或非法变量。

## 4. 目标用户体验

### 4.1 图片反推新模板

```text
管理员上传图片
  -> 图片理解
  -> 模板结构化
  -> 质量检查
  -> 校对模板
  -> 点击“保存模板并生成封面”
  -> 后端保存模板并自动入队封面任务
  -> 跳转编辑模板
  -> 页面底部显示请求快照和生成进度
  -> 成功后自动保存为封面
```

用户只做一次明确确认：保存模板。封面请求构造和入队不再需要额外确认按钮。

### 4.2 编辑已有模板

```text
编辑模板
  -> 保存模板
  -> 计算新旧模板指纹
  -> 内容未变：不重复生成
  -> 内容变化且已有封面：自动生成新预览，不覆盖旧封面
  -> 生图成功：显示“使用此结果替换封面”
```

这样既保持自动化，又避免编辑一个字段就意外替换线上封面。

### 4.3 页面显示

编辑页底部固定显示“封面生成”区域：

- 状态：未生成、排队中、生成中、已完成、失败、已过期、已被新版本替代。
- 最终 Prompt：只读，来自任务快照。
- 负面 Prompt：只读，来自任务快照。
- 画幅比例：来自任务快照。
- 变量解析：来自任务快照。
- 模板骨架：来自任务快照。
- 生成图片：成功后展示。
- 操作：重试、设为封面、用此结果替换封面。

页面可以在顶部显示轻量状态提示“封面正在根据最新模板生成”，但不新增确认弹窗。

## 5. 目标架构

```text
TemplateDraftReview.save()
        |
        v
POST /api/admin/templates
        |
        +--> 校验 TemplateDraft
        +--> 计算 templateFingerprint
        +--> 保存 prompt_templates
        +--> buildTemplateCoverRequest(template snapshot)
        +--> 幂等查找/创建 generation_jobs
        +--> 入队 BullMQ
        +--> 返回 template + coverJob
        |
        v
前端导航 /admin/templates/:id
        |
        +--> 使用响应中的 coverJob 立即展示快照
        +--> 轮询 /api/admin/jobs/:id
        |
        v
Worker image_generate
        |
        +--> 生成图片
        +--> 保存 mediaObjects
        +--> 新建图片反推模板：自动设为封面
        +--> 已有封面：保留旧封面，等待管理员替换
```

## 6. 核心领域函数

### 6.1 `buildTemplateCoverRequest`

新增后端服务文件：

```text
apps/api/src/lib/template-cover.ts
```

建议签名：

```ts
type TemplateCoverBuildResult = {
  input: {
    prompt: string;
    negativePrompt: string;
    aspectRatio?: string;
    metadata: {
      source: 'image_reverse_auto_cover' | 'template_revision_cover';
      templateId: string;
      templateFingerprint: string;
      templatePromptTemplate: string;
      resolvedValues: Record<string, string>;
      warnings: string[];
    };
  };
  warnings: string[];
};

function buildTemplateCoverRequest(
  template: PromptTemplateSnapshot,
  source: TemplateCoverSource,
): TemplateCoverBuildResult;
```

该函数是所有管理员封面入口的唯一 prompt 构造实现。`jobs.ts` 中现有内联逻辑必须迁移到此处，避免保存自动封面、手动重试和编辑后重新生成各自使用不同规则。

### 6.2 变量解析优先级

```text
1. variable.defaultValue.trim()
2. text/number 的 suggestions[0]
3. select/ratio 的 options[0]
4. 类型安全的通用兜底值
```

推荐的通用兜底值：

| 变量类型 | 兜底值 |
|---|---|
| text | `简洁明确的主体` |
| number | `1` |
| select | `默认选项` |
| ratio | `1:1`，仅当系统支持该比例时使用 |
| image | 跳过文本替换；记录 `image` 变量未参与封面文本 |

如果 `select/ratio` 存在 options，则必须从 options 选值。对非法 options、重复 key、未知占位符、残留占位符直接拒绝创建封面任务，并返回可理解的 warning/error；模板本身是否允许保存由产品策略决定，建议模板可保存但封面任务标记为失败待修复。

### 6.3 封面专用 prompt

封面 prompt 由三部分组成：

```text
渲染后的模板 prompt

封面专用约束
```

封面专用约束固定为：

```text
Create a representative cover image for this reusable image-generation template.
Keep the main subject visually prominent with clear subject-background separation.
Use a clean composition suitable for a template preview.
Do not render template variables, placeholder syntax, UI labels, watermarks, or explanatory text in the image.
```

如果项目希望完全中文，可将其翻译为中文，但必须保持所有封面任务一致。固定约束不得来自管理员可编辑字段，避免管理员 prompt 意外删除审计和防护要求。

### 6.4 negative prompt

最终 negative prompt：

```text
模板 negativePrompt（如果有）
+ unresolved placeholders
+ UI labels
+ watermarks
+ explanatory text
```

去重、去空值后以字符串发送。不要把完整模板 prompt 重复放入 negative prompt。

## 7. 模板版本与指纹

### 7.1 指纹输入

指纹必须覆盖所有影响封面结果的字段：

```json
{
  "promptTemplate": "...",
  "variables": [
    {
      "key": "subject",
      "type": "text",
      "defaultValue": "...",
      "options": [],
      "suggestions": []
    }
  ],
  "negativePrompt": "..."
}
```

规范化要求：

- 对象 key 按固定顺序序列化。
- 数组顺序保留，因为变量顺序会影响 prompt。
- 字符串 trim 后参与指纹。
- 不包含 name、summary、tags、description 等不影响生图的字段。
- 使用 SHA-256，保存完整指纹或至少保存前 16 位用于幂等查询。

### 7.2 数据库字段

建议在 `prompt_templates` 增加：

```text
revision integer not null default 1
cover_fingerprint text
active_cover_job_id uuid nullable
```

建议在 `generation_jobs` 增加：

```text
template_revision integer nullable
template_fingerprint text nullable
job_purpose text nullable -- template_cover / image_reverse_auto_cover / manual_generation
superseded_at timestamp nullable
```

如果项目希望减少 migration 数量，`template_revision` 和指纹也可以先保存在 `input.metadata`，但 `active_cover_job_id` 和唯一幂等约束建议使用真实列，以便高效查询和防并发重复。

### 7.3 版本规则

- 新建模板：`revision = 1`。
- 影响封面的字段发生变化：`revision + 1`。
- 只修改名称、摘要、标签、场景：revision 不变，不重新生成封面。
- 新任务创建时记录 revision 和 fingerprint。
- 任务完成时只有当任务 revision/fingerprint 与模板当前值一致，才允许自动写入当前封面。
- 旧任务完成但已过期时，保存结果为历史生成结果，不覆盖当前封面。

## 8. API 设计

### 8.1 保存模板接口

现有：

```http
POST /api/admin/templates
PATCH /api/admin/templates/:id
```

扩展请求字段：

```json
{
  "...": "现有模板字段",
  "autoCover": true,
  "coverMode": "auto_if_missing | auto_preview | disabled"
}
```

默认策略：

- 图片反推新模板：`autoCover = true`，`coverMode = auto_if_missing`。
- 手动新建模板：默认 `autoCover = false`。
- 已有封面的模板编辑：默认 `coverMode = auto_preview`，成功后不覆盖旧封面。

响应：

```json
{
  "template": {
    "id": "template-id",
    "revision": 1,
    "coverFingerprint": "...",
    "activeCoverJobId": "job-id"
  },
  "coverJob": {
    "id": "job-id",
    "status": "queued",
    "type": "image_generate",
    "templateRevision": 1,
    "templateFingerprint": "...",
    "input": {
      "prompt": "...",
      "negativePrompt": "...",
      "aspectRatio": "4:5",
      "metadata": {}
    }
  }
}
```

模板保存成功但封面构造或入队失败时，接口仍返回模板；`coverJob` 为 `null`，并返回结构化 warning：

```json
{
  "cover": {
    "status": "not_queued",
    "code": "COVER_QUEUE_UNAVAILABLE",
    "message": "模板已保存，封面任务稍后可重试"
  }
}
```

### 8.2 手动重试封面

```http
POST /api/admin/templates/:id/cover/retry
```

后端重新读取当前模板、重新计算 fingerprint，并调用同一 `buildTemplateCoverRequest`。不接受前端直接传入最终 prompt。

### 8.3 使用生成结果替换封面

保留现有：

```http
POST /api/admin/jobs/:id/set-cover
```

增加校验：

- job 必须是 `image_generate`。
- job.templateId 必须匹配目标模板。
- 允许替换必须由管理员明确触发，或 job 的 purpose 为新建图片反推自动封面。
- 如果 job 已被 superseded，默认拒绝自动替换，但允许管理员手动确认。

### 8.4 任务查询

现有：

```http
GET /api/admin/jobs/:id
```

保证返回：

- `input.prompt`
- `input.negativePrompt`
- `input.aspectRatio`
- `input.metadata`
- `templateRevision`
- `templateFingerprint`
- `jobPurpose`
- `supersededAt`

前端展示必须使用任务保存的 input 快照，不重新根据当前模板计算。

## 9. API 事务与幂等

### 9.1 保存事务

数据库事务内完成：

1. 校验并写入模板。
2. 计算 revision/fingerprint。
3. 查询当前模板是否已有相同 fingerprint 的活动/成功任务。
4. 没有则创建 generation job。
5. 写入 `active_cover_job_id`。

BullMQ 入队在事务提交后执行。入队失败不能回滚模板，应将 job 标记为 failed 并允许重试。

### 9.2 幂等键

建议唯一键逻辑：

```text
template_id + template_revision + template_fingerprint + job_purpose
```

同一组合只允许一个 active job。前端重复点击保存、网络重试、浏览器刷新都不能产生重复封面任务。

### 9.3 并发保存

使用数据库行锁或 compare-and-swap：

```text
UPDATE prompt_templates
SET revision = revision + 1
WHERE id = :id AND updated_at = :expectedUpdatedAt
```

冲突时返回 `TEMPLATE_CONFLICT`，前端提示重新加载，禁止静默覆盖另一个管理员的修改。

## 10. Worker 行为

worker 不需要重新构造封面 prompt，只读取 API 已冻结的 `input`：

```text
input.prompt
input.negativePrompt
input.aspectRatio
input.metadata
```

worker 负责：

1. 调用生图模型。
2. 保存生成输出。
3. 判断任务是否仍是当前模板 active job。
4. `image_reverse_auto_cover`：若模板没有封面且版本匹配，自动设为封面。
5. `template_revision_cover`：只保存结果，默认不替换已有封面。
6. 版本不匹配：标记结果为 `superseded`，不得覆盖当前封面。

推荐新增任务结果 metadata：

```json
{
  "coverApplied": true,
  "coverApplyReason": "new_template_no_existing_cover",
  "stale": false
}
```

## 11. 前端改动清单

### 11.1 `TemplateDraftReview.tsx`

- 将按钮文案改为“保存模板并生成封面”或根据 source 显示“保存并生成封面”。
- 保存请求增加 `autoCover` / `coverMode`。
- 读取保存响应中的 `template` 和 `coverJob`。
- 将 `coverJob` 通过导航 state、缓存或编辑页查询传递给编辑页。
- 保存成功但 coverJob 为空时仍导航，并显示封面任务可重试提示。

### 11.2 `AdminPage.tsx`

- 编辑页加载模板时同时读取 `activeCoverJobId`。
- 底部封面区域展示任务快照。
- 如果保存响应携带 coverJob，立即展示，不等待下一次 GET。
- 轮询封面任务状态；页面离开时停止轮询，重新进入后恢复。
- 对 `failed` 显示重试按钮。
- 对 `succeeded` 自动显示图片；根据 job purpose 决定是否显示“已设为封面”或“替换封面”。
- 模板影响封面的字段修改后显示“封面任务将根据新版本重新生成”，保存时由后端决定是否入队。

### 11.3 `useTemplateCoverJob` hook

新增：

```text
apps/web/src/hooks/useTemplateCoverJob.ts
```

职责：

- 接收 templateId、jobId。
- 首次立即刷新。
- 1.5 秒轮询 queued/running 状态。
- 终态停止轮询。
- 保留最近一次快照和 connection error。
- 支持 retry。

## 12. 状态机

### 12.1 封面任务状态

```text
not_created
  -> queued
  -> running
  -> succeeded
  -> applied

queued/running -> failed -> queued（retry）
queued/running/succeeded -> superseded
```

### 12.2 模板状态与封面状态分离

模板状态：`draft / published / archived`。

封面状态：`not_created / queued / running / failed / succeeded / applied / superseded`。

模板保存成功不能因为封面失败而变成失败状态。

## 13. 错误与恢复策略

| 场景 | 模板 | 封面任务 | 用户操作 |
|---|---|---|---|
| Prompt 构造失败 | 已保存 | 不创建或 failed | 修复变量后保存/重试 |
| Redis 不可用 | 已保存 | failed | 稍后重试 |
| Provider 超时 | 已保存 | failed，可重试 | 点击重试 |
| 生图内容被拒绝 | 已保存 | failed，不盲重试 | 修改模板或模型 |
| 页面关闭 | 已保存 | 继续后台执行 | 重新进入查看 |
| 模板被再次修改 | 新 revision | 旧任务 superseded | 查看最新任务 |
| 保存请求重复 | 保持一份 | 幂等返回已有任务 | 无额外操作 |

错误信息中不得包含 API key、Base64 图片或未脱敏 Provider header。

## 14. 自动化策略边界

### 14.1 自动执行

- 图片反推新模板保存后的封面任务。
- 新模板首张封面成功后的自动落盘。
- 编辑页的状态轮询。
- 任务失败后的状态展示。

### 14.2 保留人工操作

- 图片反推结果校对。
- 已有封面被新结果替换。
- 模板发布。
- 失败任务重试（第一阶段不做无限自动重试）。

### 14.3 后续可选自动化

- Provider 瞬时错误自动重试 1 次。
- 新版本封面自动替换旧封面，但需要模板设置明确开启。
- 批量模板封面刷新。
- 封面质量模型自动筛选和重试。

## 15. 测试矩阵

### 15.1 Shared / API

- 默认值优先级正确。
- suggestions/options fallback 正确。
- image 变量不会被错误拼入文本。
- 未知 placeholder 被拒绝。
- 负面词合并去重。
- ratio 正确提取。
- fingerprint 对影响字段变化敏感，对名称变化不敏感。
- 相同 fingerprint 幂等返回同一 job。
- 保存模板成功但入队失败时模板仍存在。
- 已有封面时新版本任务不自动覆盖旧封面。
- 旧版本任务完成不会覆盖新版本。
- 并发保存返回冲突而不是静默覆盖。

### 15.2 Worker

- 使用 API 冻结的 prompt，不重新渲染。
- 新建图片反推模板任务自动设置封面。
- stale/superseded 任务不设置当前封面。
- 生成失败保持模板已保存。

### 15.3 Web

- 保存响应中的 coverJob 立即展示。
- 页面刷新后根据 activeCoverJobId 恢复任务。
- queued/running 自动轮询，终态停止。
- failed 显示重试。
- 旧任务结果显示为过期，不覆盖当前结果。
- Prompt、negativePrompt、变量解析和骨架展示来自 job input。

### 15.4 验收测试

1. 上传一张图片并完成反推。
2. 修改至少一个变量默认值。
3. 点击一次保存。
4. 验证只创建一个模板和一个封面任务。
5. 跳转编辑页后无需额外点击即可看到实际 Prompt。
6. 验证 Prompt 已经渲染变量，不含 `{{...}}`。
7. 验证负面词和 ratio 已传入任务。
8. 模拟生图失败，确认模板仍可编辑且可重试。
9. 修改模板再次保存，确认 revision 增加、旧任务 superseded。
10. 确认旧任务完成不会覆盖新版本封面。

## 16. 分阶段实施顺序

### Phase 1：抽取封面请求服务

- 新增 `template-cover.ts`。
- 迁移 jobs.ts 内联 prompt 构造。
- 添加 unit tests。
- 保持现有手动生成行为不变。

### Phase 2：保存接口返回封面任务

- 增加 fingerprint/revision 字段或 metadata。
- 扩展 POST/PATCH templates 响应。
- 实现事务、幂等和入队失败隔离。

### Phase 3：图片反推自动编排

- TemplateDraftReview 保存时发送 autoCover。
- 后端新模板自动创建封面任务。
- 保存成功后导航并展示任务快照。

### Phase 4：编辑页任务体验

- 新增 `useTemplateCoverJob`。
- 展示实际请求内容、生成结果和失败重试。
- 页面刷新恢复 active job。

### Phase 5：版本保护

- 增加 revision/fingerprint。
- 旧任务 superseded 处理。
- 自动设封面仅允许版本匹配。

### Phase 6：增强自动化

- 瞬时 Provider 错误单次自动重试。
- 可选自动替换旧封面开关。
- 批量封面生成和质量筛选。

## 17. 验收标准

实现完成必须满足：

- 图片反推校对页保存一次即可自动开始封面生成。
- 不需要“预览确认”或第二次“生成封面”点击。
- 模板保存成功不受 Provider、Redis 或生图失败影响。
- 编辑页能显示任务真实 input，而不是重新计算的 prompt。
- 同一模板版本不会产生重复任务。
- 新版本任务不会被旧版本结果覆盖。
- 新建图片反推模板生成成功后可自动设为封面。
- 已有封面默认不会被后台自动覆盖。
- 任务失败可单独重试。
- API、worker、web 测试和 TypeScript 构建全部通过。
- `git diff --check` 通过，数据库迁移可重复部署。

## 18. 结论

最终产品行为应当是：

```text
保存即编排
自动生成
实时展示
失败可恢复
版本可追踪
旧结果不覆盖新结果
```

这套流程没有增加用户确认步骤，却保留了完整的可观察性和故障恢复能力，适合作为 Promptix 后续自动化入库和批量生成的基础架构。
