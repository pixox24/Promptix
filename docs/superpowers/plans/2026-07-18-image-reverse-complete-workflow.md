# 图片反推完整工作流实施方案

## 目标

将后台“智能入库 -> 图片反推”从基础提交页面完善为可独立完成“选择模型、配置提示词、上传图片、异步执行、查看结果、校对保存”的完整工作流。

## 当前问题

1. 图片反推页面没有模型选择器，无法明确选择结构化模型。
2. 临时系统提示词没有真正传入请求，提交时仍使用全局 prompt。
3. 上传区域没有预览、替换、移除和文件信息。
4. 结果区域只在成功且 Schema 校验通过后出现，缺少排队、执行、异常和失败状态。
5. 图片反推入口卡片没有绑定真实任务状态，始终显示“未开始”。
6. Worker 的模型角色是“视觉理解 + 文本结构化”，页面必须明确展示两者的来源。

## 目标交互

页面从上到下固定为：

1. 结构化模型选择：只展示启用、Provider 启用、支持 `text + structured_output` 的模型。
2. 视觉模型说明：展示默认视觉模型；若结构化模型自身支持 `vision`，显示“由所选模型直接处理图片”。
3. 系统提示词面板：支持全局预设、仅本次修改、恢复全局预设、保存为系统提示词。
4. 图片上传区：支持点击选择和拖拽；只接受 `image/*`，最大 10MB；显示预览、名称、大小、替换和移除。
5. 执行按钮：无图片或任务进行中时禁用；提交时发送 `modelId` 和当前临时 prompt。
6. 任务结果区：始终存在，显示 idle、queued、running、review、failed 五种状态。
7. 成功结果：先通过 `templateDraftSchema.safeParse`，成功后显示完整校对表单；失败显示原始结果不可保存并提供重试。

## 数据流

```text
GET /api/admin/models?capability=text
  -> eligibleIngestModels
  -> 选择结构化 Model

全局 prompt + 临时编辑
  -> effectivePrompt
  -> FormData(systemPrompt, modelId, file)
  -> POST /api/admin/jobs/image-reverse
  -> generation_jobs.input snapshot
  -> Worker 只读取 snapshot
  -> TemplateDraft
  -> safeParse
  -> 校对并 POST /api/admin/templates
```

## 状态与错误处理

| 状态 | 页面表现 | 操作 |
|---|---|---|
| idle | 等待上传 | 选择图片 |
| queued | 已排队 | 禁止重复提交 |
| running | 图片理解/结构化中 | 显示处理中 |
| review | 结果待校对 | 编辑并保存 |
| failed | 显示错误 | 重试 |

错误必须展示后端 `errorMessage`，不得吞掉 Schema 解析错误。任务完成但输出不符合模板契约时，显示“结果格式异常”，不能显示保存按钮。

## 代码改动范围

- `apps/web/src/components/admin/ingest/ImageReverseFlow.tsx`
  - 增加模型选择、视觉模型信息、预览、拖拽、替换、移除、真实状态和重试。
  - 提交时使用 `effectivePrompt.prompt`，同时发送 `modelId`。
- `apps/web/src/pages/admin/IngestPage.tsx`
  - 一次加载文本模型和 prompt；将模型列表传递给图片流程。
  - 图片流程始终 mounted，切换只使用 `hidden`。
- `apps/web/src/lib/ingest-workflow.ts`
  - 增加视觉模型推导和状态文案 helper。
- `apps/web/test/ingest-workflow.test.ts`
  - 增加视觉模型选择、状态映射和临时 prompt 契约测试。
- `docs/ops.md`
  - 补充图片反推的模型角色和 prompt snapshot 说明。

## 验收标准

- 可以选择结构化模型；无合格模型时明确提示。
- 上传后显示图片预览、名称和大小，可移除并释放 Object URL。
- 提交请求同时包含 `modelId`、图片和当前临时 `systemPrompt`。
- 切换到文本流程再切回图片流程，任务轮询不中断。
- 任务失败显示具体错误并可重试。
- 成功结果通过 Schema 后可编辑全部字段并保存；非法结果不可保存。
- Web 测试、构建、lint、`git diff --check` 全部通过。
