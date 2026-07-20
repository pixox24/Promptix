# Promptix Studio 图片详情模块迁移实施计划

> 文档状态：已实施并验证
>
> 编写日期：2026-07-18
>
> 接收项目：`/Users/huazi/Desktop/Promptix`
>
> 参考项目：`/Users/huazi/Desktop/promptix-studio`
>
> 目标路由：`/template/:id`

## 1. 文档目的

本文档用于指导将 `promptix-studio` 中的图片详情工作台迁移到 Promptix，替换现有前端详情页的核心工作台，同时把现有的模板 API、用户本地资料库、异步任务队列、图片 Provider 和存储能力接入新界面。

本文档是可直接执行的工程计划，不是视觉概念稿。实施过程中应按任务顺序推进，每个任务都包含明确的文件范围、行为约束、验证方式和退出条件。

## 2. 已确认且不可变的产品决定

以下决定来自本次需求确认，实施时不得自行恢复或变更：

1. 不迁移并删除无意义代码：
   - `handleSelectPreset`
   - 图片点击模拟对焦逻辑
   - `showGridHUD` / `setShowGridHUD`
   - `focusPoint` / `focusDistance`
   - 与上述逻辑相关的计时器、事件处理器、图标 import 和未使用样式
   - 其他只在参考项目中声明、但没有可达 UI 入口的状态或处理器
2. 移除“生图引擎在线”状态及其脉冲圆点，不在新详情页中显示静态在线状态。
3. 左侧媒体区域必须按响应式断点使用固定高度，切换 1:1、3:4、4:5、9:16、16:9 等比例时，左侧卡片和媒体舞台高度不得变化。
4. 当前模板的标题、描述和适用场景暂时不在详情页前端显示：
   - 不显示模板标题
   - 不显示模板描述
   - 不显示适用场景
   - 不显示包含模板标题的面包屑
   - 数据仍保留在 API、数据库和内存中
   - 模板标题仍可用于图片 `alt`、页面元数据、日志和无障碍名称，但不得作为可见正文渲染
5. 保留标签、收藏、变量编辑、建议项、风格/光影/比例选项、Prompt 行内编辑、手工编辑、复制、保存草稿、重置、草稿备忘箱和相关动画。
6. 保留 Promptix 当前真实“立即生成”业务入口，并把它接到后端真实任务链路；参考项目没有真实提交逻辑，不以其静态行为覆盖现有能力。
7. `promptix-studio` 只作为设计和交互参考源，不作为运行时依赖；实施开始时先从其 `src/App.tsx` 清理本节第 1、2 项指定的无效代码和静态状态，再以清理后的可达 UI 作为迁移参考。它的模板数据库、Unsplash 图片池、页面 Header、Footer 和 LocalStorage key 仍不复制到 Promptix。

## 3. 迁移总原则

迁移遵循以下原则：

- 视觉和交互标准来自 `promptix-studio`。
- 模板、变量、Prompt、收藏、草稿、生成任务和图片资源的业务真源来自 Promptix。
- 不把参考项目的硬编码五字段模型带入生产代码。
- 所有变量控件必须由 `template.variables` 动态生成。
- 所有 Prompt 行内词元必须由 `{{variableKey}}` 动态解析。
- 不使用 `VISUALS_POOL` 模拟生成结果；左侧只展示模板封面或真实生成结果。
- 不在公开前端暴露 Provider ID、模型 ID、内部任务输入、原始 Provider 错误或 Base64 图片数据。
- 新后端能力不能破坏现有管理员任务中心、智能入库和生成封面流程。
- 当前工作树已有未提交改动，实施时不得回退、覆盖或重写这些用户改动。

## 4. 当前代码基线

### 4.1 参考项目

参考模块主要位于：

- `promptix-studio/src/App.tsx`
- `promptix-studio/src/index.css`

参考实现当前具有以下结构：

- 页面级 Toast
- 顶部“新窗口打开”和静态引擎状态
- 左侧媒体卡片
- 固定模板标签
- 右侧变量面板
- 主体和场景输入建议
- 风格和光影选项按钮
- 比例选择器
- 深色 Prompt 编辑面板
- Prompt 内嵌变量弹层
- 复制、存草稿、重置
- 草稿备忘箱
- 页面级 Footer

迁移时只提取“详情工作台模块”，不迁移参考项目自己的页面外壳。

### 4.2 Promptix 前端

现有详情页主要位于：

- `apps/web/src/pages/DetailPage.tsx`
- `apps/web/src/components/template/VariableForm.tsx`
- `apps/web/src/components/template/PromptPreview.tsx`
- `apps/web/src/hooks/useUserLibrary.ts`
- `apps/web/src/context/UserLibraryContext.tsx`
- `apps/web/src/utils/promptBuilder.ts`
- `apps/web/src/data/templateApi.ts`

现有能力：

- 根据路由 ID 拉取公开模板
- API 失败时回退静态模板
- 使用 `template.variables` 动态生成表单
- 自动构建 Prompt
- 必填校验
- 本地收藏
- 最近使用
- 本地草稿
- 复制 Prompt
- 相似模板
- “立即生成”占位处理

当前主要缺口：

- 详情页视觉结构与参考项目不一致
- Prompt 不能按任意变量进行行内编辑
- 草稿“继续编辑”不会恢复指定草稿
- 新发布 API 模板不能稳定回查到“我的提示词”
- 公开页面不能创建真实生成任务
- 任务输出可能包含 Base64 或短期 Provider URL
- 比例没有完整传递给不同图片适配器

### 4.3 Promptix 后端和 worker

现有相关文件：

- `apps/api/src/routes/templates.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/lib/job-enqueue.ts`
- `apps/api/src/lib/job-model-selection.ts`
- `apps/api/src/db/schema.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/adapters.ts`
- `apps/worker/src/ai-adapters.ts`
- `apps/worker/src/async-image-adapter.ts`
- `apps/worker/src/db.ts`

现有能力：

- 已发布模板公开读取
- `image_generate` 任务类型
- 默认图片模型选择
- BullMQ 异步执行
- 标准 AI SDK 图片生成
- 65535 异步图片 Provider
- 本地或 OSS 存储
- `media_objects` 媒体元数据表

关键限制：

- `/api/admin/jobs` 全部要求管理员登录
- 公开详情页无法创建或读取任务
- worker 尚未统一固化生成结果
- 标准适配器没有优先读取请求级 `aspectRatio`
- 异步适配器只有 `size`，缺少统一比例映射
- 管理员和公开生成尚未共享统一的任务创建服务

## 5. 最终页面信息架构

最终详情路由保持 Promptix 全局 Navbar 和 Footer，中间详情模块采用以下结构：

```text
Promptix Layout
└── DetailPage
    ├── 加载态 / 不存在空态
    ├── PromptStudioDetail
    │   ├── 左栏 MediaCard（固定高度）
    │   │   ├── MediaStage（固定高度）
    │   │   │   ├── 模板封面或生成结果
    │   │   │   ├── 生成中遮罩
    │   │   │   ├── 生成失败状态
    │   │   │   └── 收藏按钮与 +1 动画
    │   │   └── 标签轨道
    │   └── 右栏 WorkspaceColumn
    │       ├── VariableWorkbench
    │       ├── InlinePromptEditor
    │       ├── GenerationActions
    │       └── DraftLocker
    └── 相似模板（保持为详情模块之外的次级内容）
```

当前模板标题、描述和适用场景不出现在上述可见结构中。

## 6. 固定高度和响应式规格

### 6.1 固定高度定义

“左侧固定高度”指同一断点内，以下行为不会改变 `MediaCard` 和 `MediaStage` 的高度：

- 修改主体或场景
- 切换风格或光影
- 切换图片比例
- 开始生成
- 生成成功或失败
- 从封面切换到生成结果
- 收藏或取消收藏
- 标签数量在允许范围内变化

### 6.2 尺寸规格

| 视口 | 页面布局 | MediaCard | MediaStage | 内边距 | 标签区域 |
|---|---|---:|---:|---:|---:|
| `< 640px` | 单列 | `480px` | `400px` | `16px` | `32px` 单行横向滚动 |
| `640px–1023px` | 单列 | `600px` | `504px` | `20px` | `36px` 单行横向滚动 |
| `>= 1024px` | 6/6 双列 | `680px` | `584px` | `24px` | `24px` 单行横向滚动 |

高度计算必须通过模块级 CSS 变量或明确的响应式类实现，不允许由图片比例或图片自然尺寸撑开父容器。

建议 CSS 变量：

```css
.prompt-studio-detail {
  --media-card-height: 480px;
  --media-stage-height: 400px;
}

@media (min-width: 640px) {
  .prompt-studio-detail {
    --media-card-height: 600px;
    --media-stage-height: 504px;
  }
}

@media (min-width: 1024px) {
  .prompt-studio-detail {
    --media-card-height: 680px;
    --media-stage-height: 584px;
  }
}
```

### 6.3 图片适配规则

- `MediaStage` 始终使用固定尺寸和居中布局。
- 内层图片画布根据当前比例变化，不改变外层高度。
- 横向或正方形比例优先使用 `width: 100%; height: auto`。
- 竖向比例优先使用 `height: 100%; width: auto`。
- 所有分支同时设置 `max-width: 100%` 和 `max-height: 100%`。
- 图片使用 `object-fit: cover` 填满内层比例画布。
- 比例画布可使用 `motion` 做宽高过渡，但不能给外层卡片应用 `layout` 动画。
- 比例解析失败时使用模板默认比例；没有默认比例时使用 `1:1`。
- 生成结果返回实际宽高时，以实际宽高更新内层画布比例。

### 6.4 右栏响应式规则

- `< 640px`：主体/场景等文本变量单列排列。
- `>= 640px`：连续的短文本变量允许两列。
- select、ratio、长文本和 Prompt 面板始终占满一行。
- `>= 1024px`：左右栏顶端对齐，右栏自然增长，不强制与左栏等高。
- 草稿备忘箱位于右栏变量工作台之后。
- 不允许出现参考项目移动端主体/场景强制双列导致的窄输入框。

## 7. 前端组件设计

### 7.1 `DetailPage`

文件：`apps/web/src/pages/DetailPage.tsx`

职责：

- 读取路由参数
- 获取模板
- 处理静态模板回退
- 处理加载态和不存在空态
- 读取 `?draft=<id>` 并恢复草稿
- 把模板、草稿和业务回调传给 `PromptStudioDetail`
- 保留相似模板区，但不让它影响核心工作台结构

需要移除：

- 现有详情工作台 JSX
- 显示模板标题的面包屑
- 显示模板标题、描述和适用场景的媒体遮罩
- `window.alert` 生成占位逻辑
- 旧 `generating + setTimeout` 占位状态

### 7.2 `PromptStudioDetail`

新文件：`apps/web/src/components/detail/PromptStudioDetail.tsx`

职责：

- 组合左右双栏
- 持有或调用详情工作区 reducer
- 协调变量、Prompt、草稿和生成结果
- 不直接发起 fetch
- 不硬编码模板字段名

建议 Props：

```ts
interface PromptStudioDetailProps {
  template: PromptTemplate;
  initialDraft?: SavedDraft;
  isFavorite: boolean;
  drafts: SavedDraft[];
  onToggleFavorite: () => void;
  onSaveDraft: (draft: DraftInput) => string;
  onDeleteDraft: (draftId: string) => void;
  onLoadDraft: (draftId: string) => void;
}
```

### 7.3 `MediaCard`

新文件：`apps/web/src/components/detail/MediaCard.tsx`

职责：

- 渲染固定高度媒体卡片
- 渲染模板封面或真实生成结果
- 渲染收藏按钮和收藏数量
- 渲染收藏 `+1` 动画
- 渲染生成状态遮罩
- 渲染标签轨道
- 为图片提供正确 `alt`

明确禁止：

- 图片点击对焦
- 随机对焦距离
- 网格 HUD
- `showGridHUD`
- `VISUALS_POOL`
- 根据比例改变外层卡片高度
- 静态“生图引擎在线”状态

### 7.4 `VariableWorkbench`

新文件：`apps/web/src/components/detail/VariableWorkbench.tsx`

职责：

- 遍历 `template.variables`
- 根据 variable type 渲染控件
- 显示 required 状态和错误
- 使用 `options` 渲染建议或选项
- 修改变量时回到自动 Prompt 模式，除非当前明确处于手工模式

类型映射：

| VariableType | 控件 |
|---|---|
| `text` | 文本输入；有 `options` 时显示建议 chips |
| `number` | `input[type=number]`，内部仍规范化为字符串 |
| `select` | 选项 chips |
| `ratio` | 等宽比例 chips，使用 monospace |
| `image` | 第一阶段继续使用 URL/文本输入，不引入图片编辑或图生图能力 |

风格和光影的图标只属于展示层：

- key 为 `style` 时使用风格图标集合
- key 为 `lighting` 或 `light` 时使用光影图标集合
- 其他 select 使用统一的中性图标
- 业务逻辑不得依赖中文 label

### 7.5 `PromptTokenEditor`

新文件：`apps/web/src/components/detail/PromptTokenEditor.tsx`

职责：

- 自动模式下渲染模板静态文本和可编辑变量 token
- 为不同变量分配稳定颜色
- 点击 token 打开变量弹层
- 双击面板或点击铅笔按钮进入手工编辑模式
- 手工模式使用 textarea
- 点击“完成”保留手工 Prompt
- 提供回到自动模式的重置入口

不能通过硬编码以下 token 实现：

- `{subject}`
- `{scene}`
- `{style}`
- `{lighting}`
- `{ratio}`

必须解析 Promptix 的 `{{key}}` 语法，并支持任意合法变量 key。

### 7.6 `InlineVariablePopover`

新文件：`apps/web/src/components/detail/InlineVariablePopover.tsx`

行为要求：

- 打开时把当前值写入输入框并聚焦
- 输入时实时更新对应变量
- 展示默认值和建议项
- 选择建议后关闭
- 点击外部关闭
- `Escape` 关闭
- 关闭后焦点返回 token 按钮
- 桌面端使用锚定弹层
- 移动端使用底部弹层或视口内固定面板，不能超出屏幕
- 使用 `AnimatePresence` 实现淡入、位移和缩放
- `prefers-reduced-motion` 下取消位移和缩放

为提高可访问性，Prompt token 使用 `<button type="button">`，不复制参考项目中用 `<span onClick>` 的实现。

### 7.7 `GenerationActions`

新文件：`apps/web/src/components/detail/GenerationActions.tsx`

布局：

1. 第一行：全宽“立即生成”主按钮。
2. 第二行：复制提示词、保存草稿、重置。
3. 生成中主按钮显示当前状态并禁用重复提交。
4. 失败时显示可重试入口，不使用浏览器 `alert`。

动作定义：

- `立即生成`：校验变量并创建公开任务。
- `复制提示词`：复制最终 Prompt。
- `保存草稿`：新增或覆盖活动草稿。
- `重置`：恢复默认变量、自动 Prompt 模式、封面图和空生成状态。

### 7.8 `DraftLocker`

新文件：`apps/web/src/components/detail/DraftLocker.tsx`

职责：

- 只展示当前模板的草稿，避免在隐藏模板标题的前提下展示其他模板名称。
- 显示保存时间、比例和 Prompt 摘要。
- 点击草稿恢复 values、Prompt 模式和活动草稿 ID。
- 删除草稿时不清空当前编辑状态。
- 活动草稿使用清晰描边。
- 删除按钮在键盘聚焦时同样可见，不能只依赖 hover。
- 列表最大高度固定，内部滚动。

## 8. 前端状态模型

新建：`apps/web/src/hooks/usePromptStudioState.ts`

推荐使用 reducer 管理相互关联的状态，避免继续在 `DetailPage` 中堆叠多个 `useState`。

### 8.1 状态定义

```ts
interface PromptStudioState {
  values: Record<string, string>;
  validationErrors: Record<string, string>;
  promptMode: 'auto' | 'manual';
  manualPrompt: string;
  activeDraftId: string | null;
  displayedImage: {
    kind: 'cover' | 'generated';
    url: string;
    width?: number;
    height?: number;
  };
}
```

生成任务状态独立放在 `usePublicGeneration`，避免 reducer 同时承担网络生命周期。

### 8.2 reducer 事件

- `templateLoaded`
- `variableChanged`
- `manualEditStarted`
- `manualPromptChanged`
- `manualEditFinished`
- `autoModeRestored`
- `validationFailed`
- `validationCleared`
- `draftLoaded`
- `draftSaved`
- `draftDeleted`
- `generationSucceeded`
- `workspaceReset`

### 8.3 状态不变量

- 自动模式的最终 Prompt 始终由模板和 values 计算，不另存副本。
- 手工模式的最终 Prompt 始终为 `manualPrompt`。
- 加载草稿必须一次性恢复 values 和 Prompt 模式。
- 切换路由模板必须清除旧模板活动草稿和生成结果。
- 保存活动草稿必须覆盖同一草稿，而不是每次新增重复项。
- 重置必须回到模板默认值和自动模式。

## 9. Prompt 解析和共享业务逻辑

### 9.1 移动到 shared 的纯函数

修改：`packages/shared/src/index.ts`

新增或导出：

- `renderPromptTemplate(template, values)`
- `defaultPromptValues(variables)`
- `validatePromptValues(variables, values)`
- `parsePromptTemplateSegments(promptTemplate, variables)`
- `parseAspectRatio(value)`
- `resolveTemplateAspectRatio(variables, values)`

前端 `apps/web/src/utils/promptBuilder.ts` 改为兼容封装或直接重导出，避免前后端出现两套不同的 Prompt 清理规则。

### 9.2 Prompt segment 类型

```ts
type PromptSegment =
  | { type: 'text'; value: string }
  | { type: 'variable'; key: string };
```

解析规则：

- 只识别 `{{合法变量 key}}`。
- 未在 variables 中声明的占位符保留为普通文本或在验证阶段报错。
- 相邻静态文本可以合并。
- 不使用 `dangerouslySetInnerHTML`。
- React 渲染时对文本自然转义。

### 9.3 生成请求 schema

新增 shared schema：

```ts
publicGenerationCreateSchema = z.object({
  templateId: z.string().min(1),
  values: z.record(z.string(), z.string().max(4000)),
  promptOverride: z.string().trim().min(1).max(20000).optional(),
  clientRequestId: z.string().uuid(),
});
```

后端必须重新：

- 查询已发布模板
- 解析模板 variables
- 拒绝未知 variable key
- 校验 required
- 校验 select/ratio 值是否属于允许 options
- 渲染自动 Prompt
- 只在存在合法 `promptOverride` 时使用手工 Prompt
- 从 ratio 类型变量推导 Provider 画幅参数
- 从数据库模板读取 `negativePrompt`，不信任客户端覆盖

## 10. 草稿和本地资料库升级

### 10.1 类型升级

修改：`apps/web/src/types/prompt.ts`

`SavedDraft` 增加：

```ts
promptMode: 'auto' | 'manual';
manualPrompt?: string;
aspectRatio?: string;
```

### 10.2 LocalStorage 版本迁移

修改：`apps/web/src/hooks/useUserLibrary.ts`

- Storage key 从 `promptix.userLibrary.v1` 升级到 `promptix.userLibrary.v2`，或者在同一 key 内增加 `version`。
- 读取 v1 草稿时：
  - `promptMode` 默认设为 `manual`，防止旧草稿 Prompt 被重新计算后发生变化。
  - `manualPrompt` 使用旧 `prompt`。
  - `aspectRatio` 从 values 中第一个 ratio 变量延迟推导。
- 增加 `getDraft(id)`。
- 增加 `listDraftsForTemplate(templateId)`。
- `saveDraft` 支持显式 id，覆盖活动草稿。
- 保持最多 50 个草稿限制。

### 10.3 “继续编辑”闭环

修改：`apps/web/src/pages/MyPromptsPage.tsx`

- 链接改为 `/template/:templateId?draft=:draftId`。
- API 模板不能只通过静态 `getTemplateById` 回查。
- 收藏和最近使用列表需要使用已缓存模板摘要或异步 API 回查。
- 本任务至少保证草稿列表不依赖静态模板存在才能继续编辑。

## 11. 公开生图 API 设计

### 11.1 路由

新建：`apps/api/src/routes/generations.ts`

挂载：

```text
POST /api/generations
GET  /api/generations/:id
POST /api/generations/:id/retry
```

不开放：

- Provider 选择
- 模型选择
- 任意 job type
- 管理员任务列表
- 设为模板封面
- 读取其他任务

### 11.2 创建任务

`POST /api/generations` 流程：

1. 解析并验证请求 schema。
2. 解析可信客户端标识。
3. 执行 Redis 限流和并发检查。
4. 使用 `clientRequestId` 做短期幂等。
5. 查询已发布模板。
6. 在后端验证 values。
7. 构建最终 Prompt。
8. 解析比例。
9. 选择启用的默认图片模型。
10. 创建 `image_generate` 任务。
11. 设置 `actorType = 'guest'`、`actorId = null`。
12. 写入不可逆的 `ownerKeyHash`，用于公开任务并发隔离，不保存原始 IP。
13. 写入 `templateId`。
14. 入队。
15. 签发只允许访问该 job 的短期访问令牌。
16. 返回公开任务摘要。

响应：

```ts
interface PublicGenerationCreated {
  id: string;
  status: 'queued';
  accessToken: string;
  createdAt: string;
}
```

### 11.3 任务访问令牌

新建：`apps/api/src/lib/generation-access.ts`

使用现有 `jose` 和 `JWT_SECRET`：

- 算法：HS256
- `aud`：`promptix-public-generation`
- `sub`：job ID
- `scope`：`generation:read generation:retry`
- 默认有效期：24 小时
- 令牌只能读取或重试 `sub` 对应任务
- GET 和 retry 使用 `Authorization: Bearer <token>`
- 不把令牌记录到日志

前端把令牌保存到 `sessionStorage`，key 包含 job ID；不写入 URL、不写入长期 LocalStorage。

### 11.4 公开任务响应

`GET /api/generations/:id` 只返回：

```ts
interface PublicGenerationJob {
  id: string;
  status: JobStatus;
  images?: Array<{
    url: string;
    width?: number;
    height?: number;
    mime?: string;
    expiresAt?: string;
  }>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}
```

不得返回：

- `input`
- 原始 `output`
- `providerId`
- `modelId`
- `actorId`
- `bullJobId`
- Provider 原始错误正文
- Base64

### 11.5 错误码

至少实现：

| Code | HTTP | 前端行为 |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | 标记变量或 Prompt 错误 |
| `TEMPLATE_NOT_FOUND` | 404 | 提示模板不可生成 |
| `DEFAULT_MODEL_NOT_CONFIGURED` | 409 | 禁用生成并显示配置缺失 |
| `GENERATION_DISABLED` | 503 | 提示当前不可生成，不显示在线状态 |
| `RATE_LIMITED` | 429 | 显示可重试时间 |
| `TOO_MANY_ACTIVE_JOBS` | 429 | 等待现有任务完成 |
| `QUEUE_UNAVAILABLE` | 503 | 提示稍后重试 |
| `GENERATION_ACCESS_DENIED` | 403 | 清除本地任务令牌 |
| `GENERATION_FAILED` | 200（任务终态） | 展示安全错误和重试入口 |
| `GENERATION_EXPIRED` | 410 | 恢复封面并清除任务状态 |

## 12. 限流和滥用防护

新建：`apps/api/src/lib/public-generation-rate-limit.ts`

新增环境变量：

```text
PUBLIC_GENERATION_MAX_ACTIVE=2
PUBLIC_GENERATION_MAX_PER_HOUR=10
PUBLIC_GENERATION_TOKEN_TTL_SECONDS=86400
PUBLIC_GENERATION_IDEMPOTENCY_TTL_SECONDS=600
PUBLIC_GENERATION_ENABLED=true
TRUST_PROXY_HOPS=0
```

实施要求：

- 根据部署配置安全解析客户端 IP，不能无条件信任任意 `X-Forwarded-For`。
- 使用 HMAC/JWT secret 对 IP 或匿名标识做 hash，Redis key 不保存原始 IP。
- 创建任务前检查小时配额。
- 创建任务前根据 `generation_jobs.owner_key_hash` 查询该匿名主体处于 pending、queued、running 的活动任务数。
- 活动任务数来自数据库状态，不维护需要由 worker 手工释放的 Redis 计数器；任务进入终态后会自然退出活动集合。
- API 无法连接 Redis 时失败关闭并返回 503，因为队列本身也依赖 Redis。
- 限流响应包含 `Retry-After`。
- 管理员 `/api/admin/jobs` 不走公开限流。
- `PUBLIC_GENERATION_ENABLED=false` 时创建接口返回 `GENERATION_DISABLED`，但不显示或恢复任何“引擎在线”状态。

## 13. 任务创建服务重构

现有 `validatedModel` 位于路由文件内部，公开和管理员任务无法复用。

新建：

- `apps/api/src/lib/resolve-job-model.ts`
- `apps/api/src/lib/create-generation-job.ts`

### 13.1 `resolve-job-model.ts`

职责：

- 按 job type 解析默认角色
- 验证显式管理员 model/provider
- 验证模型和 Provider enabled
- 验证 capability
- 抛出具名领域错误，不直接返回 Hono Response

管理员任务路由继续允许显式模型；公开路由只调用默认模型分支。

### 13.2 `create-generation-job.ts`

职责：

- 插入 generation job
- 统一初始状态
- 调用 enqueue
- 入队失败时原子更新为 failed
- 返回 job row

管理员 `jobs.ts` 和公开 `generations.ts` 共用该服务，避免复制状态转换逻辑。

## 14. 图片参数和 Provider 适配

### 14.1 统一内部输入

`image_generate` 的内部 input 规范为：

```ts
interface ImageGenerateInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: `${number}:${number}`;
  n: 1;
}
```

公开详情页第一阶段固定 `n = 1`，避免成本和多图交互同时扩大。

### 14.2 标准 AI SDK 适配器

修改：`apps/worker/src/ai-adapters.ts`

优先级：

1. 请求 `input.aspectRatio`
2. 模型默认 `defaults.image.aspectRatio`
3. 无比例参数

请求级 `size` 只允许管理员任务使用；公开任务由后端根据模板 ratio 生成标准比例，不接受任意像素尺寸。

### 14.3 65535 异步适配器

修改：`apps/worker/src/async-image-adapter.ts`

扩展模型默认配置：

```ts
image: {
  size: string;
  aspectRatioSizes?: Record<string, string>;
}
```

解析顺序：

1. 如果 `input.aspectRatio` 在 `aspectRatioSizes` 中，使用对应 size。
2. 否则使用模型默认 size。
3. 不允许前端直接覆盖成未配置 size。

后台模型配置页需要允许编辑这份 JSON，但本次不新增复杂可视化映射编辑器。

## 15. 生成结果固化和存储重构

### 15.1 问题

- 标准模型可能返回 Base64。
- 异步 Provider 可能返回短期 URL。
- 把 Base64 长期写入 `generation_jobs.output` 会快速膨胀数据库。
- 把短期 Provider URL直接返回前端会过期。

### 15.2 共享 Node 存储包

新建 workspace：`packages/storage`

建议包名：`@promptix/storage`

职责：

- 本地和 OSS 存储抽象
- object key 构建
- `putObject`
- `copyObject`
- `deleteObject`
- MIME/扩展名处理
- 大小限制
- 公共 URL 构建

迁移方式：

- 保留 `apps/api/src/lib/storage.ts` 作为薄兼容 facade，降低管理员上传封面回归风险。
- API facade 使用 `@promptix/storage`。
- worker 直接使用 `@promptix/storage`。
- 不把 Node 存储代码放进浏览器可导入的 `@promptix/shared`。

### 15.3 worker 结果固化

新建：`apps/worker/src/result-storage.ts`

流程：

1. 接收 adapter 的原始 images。
2. 对 Base64 解码并限制单图最大字节数。
3. 对远程 URL 设置超时、最大下载体积、允许协议和可配置 host allowlist。
4. 校验 Content-Type 为图片。
5. 写入 `temp/generations/{jobId}/{index}.{ext}`。
6. 写入 `media_objects`：
   - `storageClass = temp`
   - `prefixKind = generation`
   - `jobId`
   - `expiresAt = now + 7 days`
   - mime/bytes/width/height
7. 生成规范化 output，只包含持久 URL 和元数据。
8. 在同一成功事务中更新 job 状态。

worker `db.ts` 需要增加 `mediaObjects` 和 `promptTemplates` 的最小 schema。

### 15.4 使用次数去重

数据库迁移为 `generation_jobs` 增加：

```text
owner_key_hash text null
usage_recorded_at timestamp with time zone null
```

同时增加面向公开活动任务查询的索引：

```text
generation_jobs_owner_status_created_idx
  (owner_key_hash, status, created_at)
```

约束：

- 管理员历史任务和新管理员任务的 `owner_key_hash` 保持 null。
- 公开任务写入 HMAC 后的 owner key，不保存原始 IP、User-Agent 或匿名 cookie 内容。
- 公开 API 响应和日志不得返回 `owner_key_hash`。

worker 首次成功时：

- 仅当 `templateId` 存在且 `usageRecordedAt is null` 时递增模板 `useCount`。
- 同一事务设置 `usageRecordedAt`。
- 重试和重复消息不得重复计数。

### 15.5 生命周期

- OSS 生产环境继续对 `temp/` 配置 7 天生命周期。
- 本地开发提供清理脚本，删除 `expiresAt < now` 的临时文件并软删除 media row。
- 公开 API 对已过期任务返回 `GENERATION_EXPIRED`。

## 16. 前端生成 Hook

新建：`apps/web/src/hooks/usePublicGeneration.ts`

职责：

- 创建任务
- 保存 access token 到 sessionStorage
- 轮询任务
- 页面隐藏时降低或暂停轮询频率
- 页面恢复可见时立即刷新一次
- 组件卸载时 abort 请求和停止 timer
- 支持失败任务 retry
- 把后端状态映射为 UI 状态

建议状态：

```ts
type PublicGenerationState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'queued'; jobId: string }
  | { phase: 'running'; jobId: string }
  | { phase: 'succeeded'; jobId: string; image: GeneratedImage }
  | { phase: 'failed'; jobId?: string; error: PublicGenerationError };
```

轮询策略：

- 初始 1 秒
- 之后 2 秒
- 长任务最大 5 秒间隔
- 收到终态立即停止
- 网络临时失败最多退避重试 3 次
- 401/403/410 不继续重试

## 17. 动画规范

新增依赖：

- `motion`
- `lucide-react`

保留动画：

- Toast 进入/退出
- 收藏 `+1`
- 收藏图标状态
- Prompt token 弹层进入/退出
- 比例画布在固定舞台内部的宽高过渡
- 生成结果与封面的交叉淡入
- 按钮 active scale
- 草稿活动状态过渡

移除动画或模拟：

- 静态在线脉冲
- 随机对焦框
- 随机对焦距离
- HUD 网格
- 由外层卡片高度变化造成的 layout spring

全局要求：

- `prefers-reduced-motion: reduce` 下动画时长降到近零。
- 动画不能改变固定区域尺寸。
- 动画进行中按钮和文本不得位移导致误触。

## 18. 样式隔离

修改：`apps/web/src/index.css`

新增样式统一使用 `.prompt-studio-*` 前缀，例如：

- `.prompt-studio-detail`
- `.prompt-studio-media-card`
- `.prompt-studio-media-stage`
- `.prompt-studio-option-chip`
- `.prompt-studio-prompt-panel`
- `.prompt-studio-draft-list`

要求：

- 不把参考项目的 body 背景覆盖 Promptix 全局主题。
- 不复制参考项目全局 scrollbar 规则。
- 不复制参考项目 Header/Footer 样式。
- 模块字体优先使用 Inter 风格回退，但不通过外部 Google Fonts 阻塞页面。
- Prompt 使用现有 mono 字体栈。
- 卡片圆角保持 12px 左右，不恢复当前详情页 24px 大圆角。
- 不使用嵌套装饰卡片；变量面板和草稿箱是两个同级工具表面。

## 19. 文件变更清单

### 19.1 新建文件

```text
apps/web/src/components/detail/PromptStudioDetail.tsx
apps/web/src/components/detail/MediaCard.tsx
apps/web/src/components/detail/VariableWorkbench.tsx
apps/web/src/components/detail/PromptTokenEditor.tsx
apps/web/src/components/detail/InlineVariablePopover.tsx
apps/web/src/components/detail/GenerationActions.tsx
apps/web/src/components/detail/DraftLocker.tsx
apps/web/src/hooks/usePromptStudioState.ts
apps/web/src/hooks/usePublicGeneration.ts
apps/web/src/data/generationApi.ts
apps/web/test/prompt-studio-state.test.ts
apps/web/test/prompt-template-segments.test.ts
apps/web/test/public-generation-ui.test.ts

apps/api/src/routes/generations.ts
apps/api/src/lib/generation-access.ts
apps/api/src/lib/public-generation-rate-limit.ts
apps/api/src/lib/resolve-job-model.ts
apps/api/src/lib/create-generation-job.ts
apps/api/test/public-generations.test.mjs
apps/api/test/generation-access.test.mjs
apps/api/test/public-generation-rate-limit.test.mjs

apps/worker/src/result-storage.ts
apps/worker/test/result-storage.test.mjs
apps/worker/test/image-generation-input.test.mjs

packages/storage/package.json
packages/storage/tsconfig.json
packages/storage/src/index.ts
packages/storage/test/storage-keys.test.mjs

apps/api/drizzle/0004_public_generations.sql
apps/api/drizzle/meta/0004_snapshot.json
```

### 19.2 参考项目清理文件

用户已明确要求删除参考项目中的无效逻辑，因此实施会修改：

```text
/Users/huazi/Desktop/promptix-studio/src/App.tsx
```

清理只限于：

- 未使用图标 import
- `handleSelectPreset`
- `showGridHUD` / `setShowGridHUD`
- `focusPoint` / `focusDistance`
- `handleImageClick`
- 静态“生图引擎在线”节点和脉冲圆点
- 因删除上述内容而失去引用的注释、类型和计时器

不在参考项目中重构模板数据或迁入 Promptix API。

### 19.3 修改文件

```text
package.json
package-lock.json
packages/shared/src/index.ts
packages/shared/test/contracts.test.mjs

apps/web/package.json
apps/web/src/pages/DetailPage.tsx
apps/web/src/pages/MyPromptsPage.tsx
apps/web/src/types/prompt.ts
apps/web/src/hooks/useUserLibrary.ts
apps/web/src/utils/promptBuilder.ts
apps/web/src/index.css
apps/web/test/prompt-detail-layout.test.mjs

apps/api/package.json
apps/api/src/index.ts
apps/api/src/config/env.ts
apps/api/src/db/schema.ts
apps/api/src/routes/jobs.ts
apps/api/src/lib/storage.ts

apps/worker/package.json
apps/worker/src/db.ts
apps/worker/src/env.ts
apps/worker/src/index.ts
apps/worker/src/ai-adapters.ts
apps/worker/src/async-image-adapter.ts

.env.example
docs/ops.md
```

### 19.4 可删除或停止使用的旧文件

完成引用检查后：

```text
apps/web/src/components/template/VariableForm.tsx
apps/web/src/components/template/PromptPreview.tsx
```

只有在 `rg` 确认没有其他调用方后才删除；否则保留供其他页面使用，但详情页不再引用。

## 20. 分阶段实施任务

### Task 0：保护当前未提交工作

目标：确认并保护当前后台入库和模型配置改动。

步骤：

- [ ] 记录 `git status --short`。
- [ ] 分别读取将要重叠修改的 `schema.ts`、`jobs.ts`、`worker/index.ts`、`shared/index.ts` 和 `App.tsx` 当前 diff。
- [ ] 不执行 reset、checkout、restore 或自动覆盖。
- [ ] 每个重叠文件只做小范围 patch。
- [ ] 每完成一个任务立即重新检查 diff，确认没有删除现有逻辑。

退出条件：现有未提交功能的 diff 内容全部仍存在。

### Task 0A：清理参考项目中的无效代码和静态状态

目标：让迁移参考源只保留实际可达、需要迁移的交互。

文件：

```text
/Users/huazi/Desktop/promptix-studio/src/App.tsx
```

步骤：

- [ ] 记录清理前文件摘要和 TypeScript 检查结果。
- [ ] 删除 `handleSelectPreset`。
- [ ] 删除 `showGridHUD` 和 setter。
- [ ] 删除 `focusPoint`、`focusDistance` 和对应 setter。
- [ ] 删除 `handleImageClick` 和其随机距离、延时清理逻辑。
- [ ] 删除静态“生图引擎在线”节点和 pulse 圆点。
- [ ] 删除因此未使用的 Camera、Grid、Activity 等图标 import。
- [ ] 使用 `rg` 确认上述标识符和显示文本均为零匹配。
- [ ] 运行 `npm run lint`（`tsc --noEmit`）。
- [ ] 启动参考页，验证变量、Prompt、复制、草稿和重置仍可用。

退出条件：参考项目通过 TypeScript 检查，指定无效代码和静态状态已从源码删除。

### Task 1：建立 shared 契约和纯函数

目标：统一前后端 Prompt 和生成请求规则。

步骤：

- [ ] 为 Prompt segment、默认值、必填校验、未知 key、select 值、ratio 解析写失败测试。
- [ ] 在 shared 实现纯函数。
- [ ] 增加公开生成请求和响应 schema。
- [ ] Web promptBuilder 改用 shared。
- [ ] 运行 shared 测试和 build。

命令：

```bash
npm run test -w @promptix/shared
npm run build -w @promptix/shared
```

退出条件：前后端可导入同一套渲染和验证逻辑。

### Task 2：升级草稿数据和恢复流程

目标：先修复状态持久化，再接新 UI。

步骤：

- [ ] 写 v1 到 v2 草稿迁移测试。
- [ ] 扩展 SavedDraft 类型。
- [ ] 增加 get/list/update API。
- [ ] 修改“继续编辑”链接携带 draft ID。
- [ ] DetailPage 能恢复指定草稿。
- [ ] 验证旧 LocalStorage 数据不会导致页面崩溃。

退出条件：刷新页面或从“我的提示词”进入后可恢复同一草稿。

### Task 3：搭建新详情模块静态结构

目标：完成参考视觉结构，但暂不接真实生成。

步骤：

- [ ] 安装 `motion` 和 `lucide-react`。
- [ ] 创建 detail 组件目录。
- [ ] 创建 PromptStudioDetail、MediaCard、VariableWorkbench 和 DraftLocker。
- [ ] DetailPage 替换旧工作台。
- [ ] 删除可见标题、描述、适用场景和标题面包屑。
- [ ] 不渲染“生图引擎在线”。
- [ ] 不迁移任何对焦/HUD/预设切换代码。
- [ ] 保留加载态、空态和相似模板。

退出条件：新工作台可使用静态模板和 API 模板渲染，页面无运行错误。

### Task 4：实现固定高度媒体区域

目标：消除比例切换造成的布局跳动。

步骤：

- [ ] 写布局源契约测试。
- [ ] 实现三个断点的 CSS 变量。
- [ ] 标签改为固定高度横向轨道。
- [ ] 实现内层比例画布 contain 算法。
- [ ] 切换所有常见比例并记录 MediaCard/MediaStage bounding box。
- [ ] 验证高度差为 0 或浏览器亚像素容差内小于 1px。

退出条件：同一视口内切换比例时外层区域没有高度变化。

### Task 5：实现动态变量和行内 Prompt 编辑

目标：把参考项目的核心交互泛化到任意模板。

步骤：

- [ ] 实现 VariableWorkbench 所有 variable type。
- [ ] 实现 PromptTokenEditor。
- [ ] 实现 InlineVariablePopover。
- [ ] 支持外部点击、Escape、焦点恢复。
- [ ] 支持手工 Prompt 模式。
- [ ] 支持回到自动模式。
- [ ] 支持错误定位和清除。
- [ ] 确保没有硬编码五个字段。

退出条件：新增一个任意 key 的变量，无需修改组件即可在表单和 Prompt 中编辑。

### Task 6：接入收藏、复制、保存和重置动画

目标：完成参考项目除生成外的全部有效交互。

步骤：

- [ ] 收藏按钮连接 UserLibrary。
- [ ] 收藏数量显示本地增量。
- [ ] 实现 +1 动画。
- [ ] 复制连接现有 ToastContext。
- [ ] 保存连接活动草稿。
- [ ] 重置恢复默认值、封面和自动 Prompt。
- [ ] `prefers-reduced-motion` 验证。

退出条件：所有按钮有真实状态变化，无静态假状态。

### Task 7：抽取公共任务创建服务

目标：为公开生成路由复用现有模型和队列逻辑。

步骤：

- [ ] 为 resolve-job-model 写现有管理员行为回归测试。
- [ ] 从 jobs.ts 抽取模型解析。
- [ ] 从 jobs.ts 抽取任务创建和 enqueue。
- [ ] 管理员 jobs.ts 改用新服务。
- [ ] 运行全部 API 测试，确认后台行为不变。

退出条件：管理员任务测试全部通过，公开路由尚未加入也不影响现有行为。

### Task 8：实现公开生成路由、令牌和限流

目标：公开详情页可安全创建和读取自己的任务。

步骤：

- [ ] 实现 generation access JWT。
- [ ] 实现 rate limit。
- [ ] 实现 POST create。
- [ ] 实现 GET status。
- [ ] 实现 POST retry。
- [ ] 挂载 `/api/generations`。
- [ ] 补充环境配置和 ops 文档。
- [ ] 测试错误 token、跨 job token、过期 token、限流和队列失败。

退出条件：匿名客户端只能读取自己持有 token 的任务。

### Task 9：统一结果存储

目标：生成结果不依赖 Base64 或 Provider 临时 URL。

步骤：

- [ ] 创建 `@promptix/storage`。
- [ ] API storage facade 接入新包。
- [ ] worker 接入新包。
- [ ] 实现 result-storage。
- [ ] 增加 mediaObjects worker schema。
- [ ] 增加 usageRecordedAt migration。
- [ ] worker 成功分支改为先固化、再完成任务。
- [ ] 保持管理员 set-cover 兼容规范化 images。
- [ ] 测试 Base64、远程 URL、超大文件、错误 MIME 和存储失败。

退出条件：generation_jobs.output 中不再保存 Base64，返回 URL 在生命周期内可访问。

### Task 10：接入前端真实生成状态机

目标：替换 DetailPage 的 alert 占位。

步骤：

- [ ] 实现 generationApi。
- [ ] 实现 usePublicGeneration。
- [ ] GenerationActions 连接创建、轮询和 retry。
- [ ] MediaCard 渲染 queued/running 遮罩。
- [ ] 成功后交叉淡入真实图片。
- [ ] 失败后显示安全错误。
- [ ] 页面卸载和切换模板时停止旧轮询。
- [ ] 重置后恢复模板封面。

退出条件：从详情页提交一次真实任务，成功图片显示在固定高度媒体区域。

### Task 11：视觉和响应式 QA

目标：确认设计和交互在目标视口稳定。

视口：

- [ ] 375 × 812
- [ ] 390 × 844
- [ ] 768 × 1024
- [ ] 1024 × 768
- [ ] 1440 × 900
- [ ] 1920 × 1080

逐视口验证：

- [ ] 无横向滚动。
- [ ] 模板标题、描述、适用场景不可见。
- [ ] 静态在线状态不可见。
- [ ] 左侧高度固定。
- [ ] 标签不撑高卡片。
- [ ] 主体/场景在手机上单列。
- [ ] Prompt 弹层不越界。
- [ ] 所有按钮文本完整。
- [ ] 草稿列表内部滚动。
- [ ] 生成遮罩不改变布局。
- [ ] 键盘焦点清晰。

退出条件：没有 P0/P1/P2 视觉或交互问题。

### Task 12：全量回归

命令：

```bash
npm run test
npm run lint
npm run build
```

额外验证：

- [ ] 管理员登录。
- [ ] 管理员创建/编辑/发布模板。
- [ ] 管理员生成封面并设为封面。
- [ ] 文本入库。
- [ ] 图片反推。
- [ ] Provider 测试。
- [ ] 模型默认角色。
- [ ] 公开模板列表和详情。
- [ ] 收藏、最近、草稿。
- [ ] 公开生成。
- [ ] worker 重试。

退出条件：所有现有测试和新增测试通过，生产 build 成功。

## 21. 测试矩阵

### 21.1 shared 单元测试

- 空变量
- required 变量
- 未知 key
- 非法 select 值
- ratio 解析
- 多次相同 token
- 未声明 token
- 手工 Prompt 长度
- 中文、英文和换行

### 21.2 前端状态测试

- 模板初始化
- 变量修改更新自动 Prompt
- 手工模式不被自动 Prompt 覆盖
- 加载草稿恢复所有状态
- 保存活动草稿覆盖
- 删除活动草稿不清空编辑内容
- 重置恢复默认值
- 生成成功替换图片
- 切换模板清理旧任务

### 21.3 API 测试

- 未发布模板不可生成
- 默认图片模型缺失
- 非图片模型拒绝
- required 缺失
- 非法 ratio
- 未知变量
- 有效创建
- 幂等创建
- 错误 token
- token/job 不匹配
- token 过期
- rate limit
- active job limit
- Redis/queue 不可用
- retry 终态限制

### 21.4 worker 测试

- 标准模型 request aspectRatio 优先级
- 异步模型 ratio 到 size 映射
- Base64 固化
- URL 固化
- 超时
- 超大结果
- 非图片响应
- 存储失败任务进入 failed
- useCount 只递增一次

### 21.5 浏览器交互测试

- 文本输入
- 建议项
- 风格选项
- 光影选项
- 比例选项
- 行内 token 弹层
- Escape
- 外部点击
- 手工 Prompt
- 复制
- 收藏
- 保存/恢复/删除草稿
- 重置
- 创建任务
- 成功结果
- 失败重试

## 22. 可观测性和日志

API 日志事件：

- `public_generation_requested`
- `public_generation_rate_limited`
- `public_generation_enqueued`
- `public_generation_access_denied`

worker 日志事件：

- `generation_result_download_started`
- `generation_result_stored`
- `generation_result_storage_failed`
- `generation_usage_recorded`

日志字段允许：

- jobId
- templateId
- status
- durationMs
- bytes
- mime
- errorCode

日志字段禁止：

- 完整 Prompt
- API key
- access token
- 原始 IP
- Base64
- Provider 完整响应

## 23. 数据库和部署顺序

部署顺序：

1. 发布向后兼容数据库 migration。
2. 发布 shared 和 storage workspace build。
3. 发布 API，管理员旧路由保持可用。
4. 发布 worker，开始产出规范化图片结果。
5. 验证管理员生成封面。
6. 发布 Web 新详情页。
7. 开启公开生成流量。
8. 观察限流、失败率、队列时长和存储错误。

回滚要求：

- migration 只新增 nullable 字段和索引，不删除旧字段。
- API 继续兼容旧 worker output 的 `url`/`b64_json` 读取，直至部署稳定。
- Web 回滚不影响新 API 和 worker。
- 不回滚当前工作树中已有的入库和 Provider 改动。

## 24. 风险和缓解

### 风险 1：当前工作树存在重叠改动

缓解：小 patch、逐文件 diff、任务级测试，不做整文件替换。

### 风险 2：公开生成产生真实成本

缓解：默认模型固定、`n=1`、限流、活动任务限制、幂等、可配置关闭入口。

### 风险 3：Provider 返回大 Base64 导致数据库膨胀

缓解：worker 成功前固化到存储，output 只保留 URL 元数据。

### 风险 4：Provider 临时 URL 过期

缓解：worker 立即下载并存入 Promptix 存储。

### 风险 5：比例切换重新引发布局跳动

缓解：只动画内层比例画布，自动化读取外层 bounding box。

### 风险 6：隐藏模板信息降低可辨识度

缓解：保留封面、标签、图片 alt 和页面元数据；草稿箱只展示当前模板草稿。

### 风险 7：动态变量超出参考项目五字段范围

缓解：控件完全由 schema 驱动，对未知 key 使用中性视觉，不按中文 label 分支。

### 风险 8：移动端 Prompt 弹层越界

缓解：移动端切换为固定底部面板，桌面端再使用锚定弹层。

## 25. 完成定义

只有同时满足以下条件，迁移才视为完成：

- [ ] 详情页核心工作台已替换为参考项目的 Bento 视觉和有效交互。
- [ ] 无 `handleSelectPreset`、模拟对焦、`showGridHUD` 或相关死代码。
- [ ] 无“生图引擎在线”静态状态。
- [ ] 当前模板标题、描述和适用场景不在详情页可见。
- [ ] 左侧媒体卡片在每个断点内高度固定。
- [ ] 任意模板变量可动态渲染和行内编辑。
- [ ] 草稿可以保存、覆盖、恢复和删除。
- [ ] 收藏、复制和重置行为完整。
- [ ] 公开生成使用真实后端任务。
- [ ] 公开任务具有访问隔离和限流。
- [ ] 图片结果已固化，不长期保存 Base64。
- [ ] 管理员现有任务、入库和生成封面流程无回归。
- [ ] 全量测试、lint 和 build 通过。
- [ ] 六个目标视口完成截图和交互验收。
