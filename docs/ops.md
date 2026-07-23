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

## Provider 与 Model 运维

- Provider 是连接配置：Adapter、Base URL、认证方式和密钥环境变量名。
- Model 是可执行配置：厂商 Model ID、能力、默认用途和调用默认值。一个 Provider 可以包含多个 Model。
- 默认文本模型必须具备 `text + structured_output`；默认视觉模型必须具备 `vision`；默认生图模型必须具备 `image`。
- `openai_compatible`、`openai`、`anthropic`、`google`、`deepseek` 的标准能力由 AI SDK 7 执行；`custom_65535_async` 仅用于异步生图。
- API 与 Worker 必须获得同名密钥环境变量。后台只显示密钥是否已配置，不返回密钥值。

### Provider 连接测试

- 在 **Providers & Models** 中为 Provider 点击“测试连接”，再选择一个属于当前 Provider、已启用且具备 `text` 能力的 Model。
- 测试会创建 `provider_test` 队列任务，并使用 Worker 的实际密钥、网络与模型调用链路；成功只记录 `ok`、`providerId`、`modelId`、`latencyMs` 和 `checkedAt`，不包含原始模型响应、凭据或请求/认证头。
- 失败时先在任务中心查看安全错误摘要：密钥未配置、401/403、404、429、超时或网络失败；修复后可重试。
- “key 已配置”仅表示 API 进程读到了环境变量，不能替代一次成功的连接测试。

新任务会同时保存 `model_id` 与所属 `provider_id`。旧客户端仍可暂时只传 `providerId`；系统会优先选择该 Provider 的旧默认模型、相应角色默认模型，再选择首个能力兼容模型。

## 升级与迁移验收

升级前先停止写入并执行可恢复备份：

```bash
pg_dump -Fc promptix > promptix-before-model-registry.dump
npm ci
npm run db:migrate
```

迁移是加法迁移：新增 `provider_models`、`providers.adapter_type` 和 `generation_jobs.model_id`，保留 `providers.kind/protocol/default_model/defaults/is_default` 与 `generation_jobs.provider_id`。完成后检查：

```sql
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
```

前两个结果应为 `0`，后三个结果都不得大于 `1`。正式迁移器可以重复运行；不要手工重复执行单个迁移 SQL 文件。

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
- 使用带数据库编号的 Redis URL（例如 `redis://host:6379/2`）时，API 与 Worker 必须配置完全相同的 URL。
- 任务长期 queued：Worker 未运行或队列名不一致；查看 Worker 的 JSON 日志 `worker_ready`。
- `DEFAULT_MODEL_NOT_CONFIGURED`：为任务类型配置已启用且能力匹配的默认 Model，并确认其 Provider 已启用。
- `MODEL_CAPABILITY_MISMATCH`：检查 Model 能力声明与 Adapter 是否真的支持该任务，不要只修改默认标记绕过能力校验。
- 任务 failed：后台任务中心查看 `errorMessage`，确认 Provider Base URL、Model ID 及密钥环境变量；修复后点击重试。重试会先移除 BullMQ 中保留的终态 Job，再安全复用原 Job ID。
- 65535 返回 `INVALID_API_KEY`：确认 `IMAGE_65535_API_KEY` 是当前有效密钥；Bearer 与 `X-API-Key` 认证方式应与账号文档一致。不要把密钥粘贴进 Provider 数据库字段。
- 图片无法显示：确认 OSS 公读/CDN URL，或本地模式下 `/uploads` 已反代到 API。

## 应用回滚

## 智能入库工作流

`/admin/ingest` 提供“文本优化”和“图片反推”两个独立流程，各自拥有全局系统提示词。提交时可仅修改本次任务；点击“保存为系统提示词”才会更新全局预设。API 在创建任务前将最终提示词写入 job input snapshot，Worker 只读取该快照，因此后续修改全局提示词不会影响已排队任务。

部署包含本功能的版本时，先执行 `npm run db:migrate`，再同时重启 API 与 Worker，确保新增 prompt 表和消费逻辑版本一致。

发布后如需快速回滚，先停止新 API/Worker，再部署旧版本代码。由于迁移保留了旧 Provider 字段和 `generation_jobs.provider_id`，旧代码可继续读取兼容数据；不要为了应用回滚删除 `provider_models` 或 `model_id`。只有灾难恢复时才创建空库并用升级前的 `pg_dump` 通过 `pg_restore` 恢复。

### 模板分类词库与发布门禁

`/admin/taxonomy` 维护产物类型、使用场景、视觉风格和画面主体。slug 是稳定标识，创建后不可修改；已被引用的词只能停用，不要直接从数据库删除。停用项仍可用于展示历史模板，但新草稿不能选择，包含停用项的模板不能重新发布。

提示词优化和图片反推任务在创建时会把启用词库及其哈希写入任务快照，重试仍使用原快照。AI 产生的未知概念进入待处理词，管理员必须映射、转为自由标签或忽略；新模板始终保存为草稿，只有完整分类、人工确认且有封面时才可发布。

执行 `0009` 分类迁移前先备份数据库。迁移后检查：

```sql
SELECT dimension, count(*) FROM taxonomy_terms GROUP BY dimension ORDER BY dimension;
SELECT count(*) FROM prompt_templates WHERE output_type_id IS NULL;
SELECT taxonomy_review_status, count(*) FROM prompt_templates GROUP BY taxonomy_review_status;
SELECT count(*) FROM template_taxonomy_assignments;
```

初始词库应为 `output_type=7`、`scenario=14`、`style=12`、`subject=12`。第二条查询中的记录需要人工处理；不要为了通过检查将其批量静默归入“通用视觉”。应用回滚时保留新增表和列，旧代码继续读取双写的 `category/scenarios/tags` 兼容字段。

## 安全基线

- `.env` 不进入版本库；Provider 只保存密钥的环境变量名。
- 管理端 Cookie 使用 HttpOnly；生产必须设置 `COOKIE_SECURE=true` 并启用 HTTPS。
- 管理上传限制为图片 MIME 且最大 10MB。
- 定期审计管理员账号、RAM 最小权限和失败任务日志。
## 相似模板推荐闭环

发布顺序固定为：

1. 先执行 `npm run db:migrate` 并部署 API、Worker，确认 `GET /api/templates/:id/similar` 返回 `similar-v1`。
2. 再部署 Web，保留静态推荐兜底一个发布周期；兜底结果不带 `requestId`，也不上报推荐事件。
3. 通过管理员接口 `GET /api/admin/templates/:id/recommendation-metrics?days=30` 检查曝光、点击、成功生成、CTR、CVR 和位置表现。
4. similar endpoint p95 应不高于 250ms，事件 POST p95 应不高于 150ms，推荐接口 5xx 应低于 0.5%。
5. 若详情页错误率增加超过 0.5 个百分点、similar p95 超过 250ms，或 CTR 比旧版基线低 10% 以上，先将 Web 回滚到静态兜底；保留数据库表和 API 供排查。
6. 连续稳定 14 天且累计曝光不少于 500 次后，将 Web 构建变量 `VITE_SIMILAR_TEMPLATE_STATIC_FALLBACK=false`；再稳定一个发布周期后，才允许删除静态排序代码。

原始推荐事件保留 180 天。定期执行：

```sql
delete from template_recommendation_events
where created_at < now() - interval '180 days';

delete from template_recommendation_requests r
where r.created_at < now() - interval '180 days'
  and not exists (
    select 1
    from template_recommendation_events e
    where e.request_id = r.id
  );
```

应用回滚不删除 `template_recommendation_requests` 或 `template_recommendation_events`。推荐事件写入失败不得阻断详情页跳转和生成流程；worker 会记录 `recommendation_attribution_failed` 结构化错误用于排查。

# 图片反推流水线

图片反推默认先由视觉模型生成客观描述，再由文本结构化模型生成模板 JSON。模型自身的 `temperature` 和 `maxOutputTokens` 配置优先；未配置时使用：

```env
INGEST_VISION_MAX_OUTPUT_TOKENS=3000
INGEST_STRUCTURE_MAX_OUTPUT_TOKENS=6000
INGEST_OUTPUT_PREVIEW_CHARS=500
INGEST_STRUCTURE_REPAIR_ENABLED=true
```

结构化失败时检查管理员任务中的 `errorCode`、`errorDetails.finishReason` 和有限输出预览。`STRUCTURE_OUTPUT_TRUNCATED` 表示需要增加结构化模型输出上限；`STRUCTURE_JSON_INVALID` 表示兼容接口返回的正文不是合法 JSON；`STRUCTURE_SCHEMA_INVALID` 表示 JSON 可解析但字段不符合模板契约。
