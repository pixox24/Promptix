# 模板封面刷新与 AI 生成图持久化修复方案

## 目标

修复两个用户可见问题：

1. 上传替换封面后，后台仍显示浏览器缓存中的旧图片。
2. AI 厂商已成功生成图片，但 Worker 保存目录与 API 静态目录不一致，导致生成图 URL 404，页面也没有候选图预览。

## 根因

### 本地存储目录漂移

共享 Storage 使用 `path.resolve(process.cwd(), LOCAL_STORAGE_DIR)`。npm workspace 启动时 API 和 Worker 的 cwd 不同，相同相对路径分别落到：

```text
API:    apps/api/apps/api/.tmp/uploads（或 API 自己解析的仓库路径）
Worker: apps/worker/apps/api/.tmp/uploads
```

Worker 返回的 URL 指向 API `/uploads`，但文件并不在 API 服务目录，因此返回 404。

### 封面 URL 不变化

上传封面始终覆盖 `public/templates/{id}/cover.ext`，数据库 `coverUrl` 不变。浏览器和 CDN 会继续使用相同 URL 的缓存。

### 前端未渲染生成结果

模板编辑器只显示异步任务状态和“设为封面”按钮，没有渲染 `generation_jobs.output.images`。

## 修复顺序

### 1. 统一共享本地存储根目录

- `packages/storage` 不再基于 `process.cwd()` 解析相对目录。
- 使用包文件位置推导 monorepo 根目录，再拼接 `LOCAL_STORAGE_DIR`。
- 绝对路径配置保持原样。
- API 与 Worker 必须得到完全相同的本地路径。

### 2. 封面对象版本化

- 上传封面使用唯一对象名，例如 `cover-{timestamp}.png`。
- AI 设为封面使用 job ID，例如 `cover-{jobId}.png`。
- 数据库更新成功后删除旧对象，避免无限残留。
- 返回的 `coverUrl` 每次变化，浏览器自然重新加载。

### 3. 增加 AI 生成图预览

- 扩展前端 Job 类型，使 `output.images` 有明确类型。
- 任务成功后渲染所有候选图。
- 用户先预览，再选择某张“设为封面”。
- 设为封面后立即刷新封面状态。
- 图片加载失败显示清晰错误，不静默空白。

### 4. 加强 set-cover 下载校验

- 下载生成图时检查 HTTP 状态。
- URL 缺失、404 或响应失败时返回可读 API 错误。
- 不允许把错误响应体当作 PNG 保存。

## 兼容与数据处理

- 不修改数据库 Schema。
- 已存储在错误 Worker 目录的历史临时图片不会自动迁移；它们仅为 7 天临时资产，可重新生成。
- 现有模板封面继续可读；下一次替换时切换为版本化对象名。
- OSS 模式同样使用版本化 key，可避开 CDN 缓存。

## 验收标准

1. API 和 Worker 对同一相对 `LOCAL_STORAGE_DIR` 解析出相同绝对目录。
2. Worker 写入的生成图 URL 经 API 请求返回 HTTP 200 和图片 MIME。
3. 连续上传两次封面，`coverUrl` 必须不同。
4. 第二次上传后编辑器立即显示新图。
5. AI 任务成功后候选图立即显示。
6. 点击候选图“设为封面”后主封面立即更新。
7. 生成图 URL 404 时，set-cover 返回清晰错误而不是保存错误内容。
8. shared、API、Worker、Web 测试与构建通过，`git diff --check` 通过。
