# 模板治理运维手册

## 日常入口

- 管理工作台：`/admin/templates`
- 治理读取与操作 API：`/api/admin/governance/*`
- 默认调度器 ID：`template-governance-default`
- 当前治理提示词版本：`template-governance-v1`

## 启停与调整巡检

在“智能分拣台 → 治理规则”中修改启用状态、Cron、时区与扫描上限。保存会创建新的规则版本，并重新注册 BullMQ 调度器；历史运行继续引用原规则版本。默认计划为每天 `03:00`、`Asia/Shanghai`。

如果调度注册失败，API 仍可启动；`GET /api/admin/governance/rule-sets/active` 的 `scheduler.error` 会显示错误。恢复 Redis 后重新保存规则或重启 API 以再次注册。

## 检查运行与失败项

1. 用 `GET /api/admin/governance/runs` 查看最近运行。
2. 用 `GET /api/admin/governance/runs/:id` 查看提案、失败原因与稳定错误码。
3. 用 `GET /api/admin/governance/change-sets/:id` 查看逐项状态。
4. `failed` 与 `conflict` 会进入“失败与冲突”队列；不要直接修改数据库状态。

## 审批、重试与回滚

- 发布、归档、永久删除、Prompt 骨架和变量修改必须经过审批。
- 永久删除审批必须输入“永久删除”并填写原因。
- 审批前会重新检查活动规则版本和模板基础版本；出现 `RULE_SET_CHANGED` 或 `VERSION_CONFLICT` 时重新生成计划。
- 部分成功时只重试可重试的失败项。所有重试请求都应使用新的幂等键。
- 回滚是创建一个新的前向版本，不删除历史；只有当前版本仍等于原应用版本且未超过 `rollbackUntil` 时允许。
- 永久删除不可回滚。

## 治理提示词升级

修改 `apps/worker/src/governance-prompt.ts` 时：

1. 同时递增 `GOVERNANCE_PROMPT_VERSION`。
2. 保持模板内容为不可信数据、只使用目录内分类、不得由模型决定风险/审批等约束。
3. 运行 Worker 全部测试。
4. 观察新版本小批量运行，再扩大扫描上限。

每个 `AgentRun.promptVersion` 都会固定记录实际版本，便于审计与复现。

## 安全修改规则

规则始终以新版本保存，不原地修改历史版本。重点检查：最低自动置信度、自动批次上限、回滚小时、精选槽位、最大替换比例、调整冷却和可选输出类型配额。降低限制前先预览当前待处理数量，避免一次自动处理过多模板。

## 故障恢复

- Redis：创建运行或执行任务失败时，运行/变更集会被标记为可见的 `failed`，不会永久停留在 `queued`。恢复后从变更集执行“重试失败项”。
- 模型：检查默认文本模型是否启用并同时具备 `text`、`structured_output` 能力；模型输出不符合 Schema 时运行以 `INVALID_GOVERNANCE_OUTPUT` 失败，不写入部分提案。
- 数据库：停止 API/Worker 写入，恢复数据库后先核对迁移版本、模板数量、`template_versions` 版本连续性和唯一活动规则，再恢复队列消费者。
- Worker：治理 apply/rollback 不应解析模型；若发现无模型任务尝试解析模型，停止 Worker 并检查任务类型路由。

## 建议监控

- 队列最老任务等待时长与 `queued` 数量
- 定时巡检成功率和运行耗时
- 自动执行完成率、审批通过/拒绝率
- `VERSION_CONFLICT`、`RULE_SET_CHANGED`、模型 Schema 错误率
- 部分成功、重试成功和回滚频率
- 精选自动替换比例与规则外审批数量

告警建议：队列年龄持续超过一个巡检周期、失败率连续升高、活动规则数不等于 1、或存在超过回滚窗口仍未处理的部分失败变更集。
